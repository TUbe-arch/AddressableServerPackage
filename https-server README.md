> 目的：讓 Unity WebGL 應用程式能從伺服器動態下載 3D 模型與資源


## 一、後端需要做什麼

---

只需要架一台**靜態檔案 HTTP 伺服器**，把 Unity 開發端打包好的資源檔案放上去，讓 Unity 應用程式可以透過 HTTP GET 下載即可。  

**不需要任何 API 邏輯、資料庫、或驗證機制。**

## 二、伺服器規格需求

---

| 項目 | 需求 |
| --- | --- |
| 通訊協定 | **HTTPS（正式環境必須）**，開發測試可用 HTTP |
| 型態 | 靜態檔案伺服器（Static File Server） |
| 建議工具 | Nginx / Apache / Node.js `serve` / Caddy 皆可 |
| 埠號 | 自定（請提供給Unity端） |
| 網路 | 需讓 Unity 應用程式可連線（視部署環境：內網 or 公網） |

### 為什麼正式環境一定要 HTTPS？

這是瀏覽器的 **Mixed Content** 安全機制：

```
正式網頁  https://your-site.com        ← HTTPS 頁面
Addressable 伺服器  http://server:8080  ← HTTP 資源 ✗ 瀏覽器直接擋掉
```

> **只要網頁本身是 HTTPS，頁面內所有的資源請求也必須是 HTTPS**
> 

> 若 Addressable 伺服器是 HTTP，瀏覽器會拋出 Mixed Content Error，3D 模型完全無法載入
> 

| 環境 | 網頁協定 | Addressable 伺服器 |
| --- | --- | --- |
| 本機開發測試 | `http://localhost` | HTTP 可以 |
| 正式網站內嵌 | `https://...` | **必須 HTTPS** |

## 三、必要的 HTTP 回應 Header（CORS）

---

> **這是最重要的設定**。因為 Unity 應用程式是跑在瀏覽器（WebGL），瀏覽器有同源政策限制，若沒有 CORS header，資源會被瀏覽器直接擋掉，應用程式無法載入任何東西。
> 

伺服器對所有 `/WebGL/` 路徑下的請求，必須回傳以下 Header：

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, HEAD, OPTIONS
Access-Control-Expose-Headers: Content-Length, Content-Range
```

### Nginx 設定範例（正式環境 HTTPS）

```
server {
    listen 443 ssl;
    server_name your-cdn-domain.com;

    ssl_certificate /etc/ssl/certs/your-cert.pem;
    ssl_certificate_key /etc/ssl/private/your-key.pem;

    location /WebGL/ {
        root /var/www/addressables;

        # OPTIONS preflight 獨立處理（確保 CORS header 有帶出去）
        if ($request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin *;
            add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS";
            add_header Access-Control-Expose-Headers "Content-Length, Content-Range";
            return 204;
        }

        # 正常請求的 CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS";
        add_header Access-Control-Expose-Headers "Content-Length, Content-Range";
    }
}

# HTTP 自動跳轉 HTTPS
server {
    listen 80;
    server_name your-cdn-domain.com;
    return 301 https://$host$request_uri;
}
```

## 四、伺服器目錄結構

---

後端只需要提供一個路徑放檔案，目錄結構如下：

```
<伺服器根目錄>/
└── WebGL/
    ├── catalog.json          ← 資源目錄（Unity 啟動時最先讀取這個）
    ├── catalog.hash          ← 版本識別碼（用來判斷資源有沒有更新）
    ├── buildings_model_xxx.bundle    ← 3D 建築模型 bundle
    ├── buildings_resource_xxx.bundle ← 場景資源 bundle
    └── ...（其他 .bundle 檔案）
```

> `xxx` 是 Unity build 時自動產生的 hash，每次重新打包可能會不同。
> 

WebGL 下層的路徑都是 Unity 自動打包出來的，之後 Unity 端要更新 Addressable 資料都是直接交付WebGL 資料夾進行覆蓋

### 各檔案說明

| 檔案 | 說明 |
| --- | --- |
| `catalog.hash` | 只有幾個字，Unity 每次啟動時用來比對版本，判斷要不要重新下載 catalog |
| `catalog.json` | 告訴 Unity「哪個 bundle 在哪個 URL」的對應表，JSON 格式 |
| `*.bundle` | 實際的 3D 模型、貼圖、材質等資源壓縮包，二進位格式（不用解開） |

## 五、工作流程（雙方分工）

---

```
[Unity 端]                                  [後端]
     │                                       │
     │  ① 打包 Addressable 資源              │
     │  → 產生 catalog.json/hash + bundle    │
     │                                      │
     │  ② 提供打包檔案給後端 ──────────────►  │
     │    （壓縮包 or 共享資料夾）            │
     │                                      │  ③ 將檔案部署至伺服器 /WebGL/ 目錄
     │                                      │
     │  ④ 確認 URL 正確 ◄─────────────────   │  提供伺服器 URL 給 Unity 端
     │                                      │
     │  ⑤ 更新 Unity 設定中的 Remote URL     │
     │  ⑥ 測試 WebGL Build 可正常載入        │
```

**更新資源時（熱更新流程）：**

1. Unity 端重新打包 → 產生新的 `catalog.hash` / `catalog.json` / `*.bundle`
2. 將新檔案提供給後端
3. 後端**覆蓋**伺服器上的舊檔案
4. 應用程式下次啟動時會自動偵測到 `catalog.hash` 變動，自動下載新資源

## 六、後端需要給Unity端的東西

---

架好後請提供：

```
伺服器 URL：https://<你的域名>/WebGL/

範例（正式）：https://assets.your-domain.com/WebGL/
範例（測試）：http://192.168.1.100:8080/WebGL/
```

這個 URL 會填入 Unity 設定，讓應用程式知道去哪裡下載資源。

> 正式上線前請確認 URL 是 `https://`，否則內嵌在正式網站時模型將無法載入。
> 

## 七、常見問題

---

**Q：Bundle 檔案很大，需要做什麼特別設定嗎？**  

A：不需要。Unity 會自動處理，伺服器只要能正常回傳靜態檔案即可。支援 Range Request 更好（Nginx 預設就支援），但非必要

**Q：需要資料夾列表（Directory Listing）嗎？**  

A：不需要，關閉即可。Unity 只會請求它知道的特定檔案路徑

**Q：Bundle 檔案的 Content-Type 需要特別設定嗎？**  

A：不需要，`application/octet-stream` 即可，Unity 不依賴 Content-Type 判斷

**Q：要怎麼傳檔案給後端？**  

A：雙方討論後決定（SFTP / 共享資料夾 / 上傳介面皆可）

## 八、注意事項

---

1. 由於Unity的Addressable系統本身並不支援相對路徑，因此就算是放在同一個根目錄底下，在Remote.LoadPath部分的設定前方還是必須加上URL，才抓的到東西

2. 如果強制重新整理與刪除快取，前端讀取到的WebGL檔案都還是舊版的話，那是ServiceWorker的問題，進入F12 Dev模式，開啟應用程式，把ServiceWorkers的內容清除就可以了，Unity端則是要注意要出新內容的話就要改版號，才能強制ServiceWorker重新刷新