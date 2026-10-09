package com.mnzmnz10.lkm;

import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    /**
     * WebView indirmeleri kendiliğinden kaydetmez. Arayüzdeki "Telefona al" ve "İndir"
     * bağlantılarını Android'in indirme yöneticisine verir; dosya İndirilenler klasörüne iner
     * ve bildirimde görünür. Tailscale VPN tüm cihazda açık olduğu için adres oradan da açılır.
     */
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) -> {
            if (!url.startsWith("https://") && !url.startsWith("http://")) {
                Toast.makeText(this, "Bu dosya indirilemedi.", Toast.LENGTH_SHORT).show();
                return;
            }
            String fileName = URLUtil.guessFileName(url, contentDisposition, mimeType);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            String cookies = CookieManager.getInstance().getCookie(url);
            if (cookies != null) request.addRequestHeader("Cookie", cookies);
            request.addRequestHeader("User-Agent", userAgent);
            request.setMimeType(mimeType);
            request.setTitle(fileName);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            manager.enqueue(request);
            Toast.makeText(this, fileName + " indiriliyor…", Toast.LENGTH_SHORT).show();
        });
    }
}
