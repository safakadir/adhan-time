# Namaz Vakti API

iPhone Kestirmeleri'nden çağrılmak üzere yazılmış küçük bir namaz vakti servisi.
Konumu alır, o konumun bağlı olduğu ilçenin Diyanet vakit tablosunu çeker ve
doğrudan ekranda gösterilebilecek bir metin döner:

```
Sonraki vakit: İkindi, 2sa 17dk sonra - Gazipaşa/Antalya
```

## Uçlar

| Uç | Açıklama |
| --- | --- |
| `GET /vakit?lat=36.2694&lng=32.3183` | Koordinattan vakit bilgisi (JSON) |
| `GET /vakit?il=Antalya&ilce=Gazipaşa` | İl/ilçe adıyla vakit bilgisi (JSON) |
| `GET /vakit?...&format=text` | Sadece `displayText` satırı, düz metin |
| `GET /` | Kısa kullanım bilgisi (health check olarak da kullanılır) |

### Örnek yanıt

```json
{
  "ok": true,
  "displayText": "Sonraki vakit: İkindi, 2sa 17dk sonra - Gazipaşa/Antalya",
  "currentPrayer": "Öğle",
  "nextPrayer": "İkindi",
  "nextPrayerTime": "16:49",
  "nextPrayerDate": "2026-08-02",
  "remaining": "2sa 17dk",
  "remainingMinutes": 137,
  "location": "Gazipaşa/Antalya",
  "date": "2026-08-02",
  "times": {
    "İmsak": "04:18",
    "Güneş": "05:51",
    "Öğle": "13:02",
    "İkindi": "16:49",
    "Akşam": "20:03",
    "Yatsı": "21:29"
  },
  "source": "diyanet"
}
```

Hata durumunda HTTP kodu 400/502 olur ama gövdede yine `displayText` bulunur,
böylece Kestirmeler'de hata mesajı da ekranda gösterilebilir.

## Veri kaynakları

| Kaynak | Ne için |
| --- | --- |
| [ezanvakti.emushaf.net](https://ezanvakti.emushaf.net) | Diyanet'in resmi vakit tabloları (ilçe bazında, 32 günlük) |
| [BigDataCloud](https://www.bigdatacloud.com/) reverse geocoding | Koordinat → il/ilçe (anahtar gerektirmez) |
| [Aladhan](https://aladhan.com/prayer-times-api) `method=13` | Yedek kaynak: yurt dışı veya Diyanet listesinde eşleşmeyen konumlar |

Öncelik her zaman Diyanet tablosundadır; hangisinin kullanıldığı yanıttaki
`source` alanından görülür. Hiçbiri API anahtarı istemez.

## Yerelde çalıştırma

```bash
npm install
npm start          # http://localhost:3000
curl "http://localhost:3000/vakit?lat=36.2694&lng=32.3183&format=text"
```

## Render'a deploy

1. Bu klasörü bir Git deposuna koyup GitHub'a it.
2. Render'da **New → Web Service** ile depoyu bağla. `render.yaml` ayarları
   (build: `npm install`, start: `npm start`) otomatik algılanır.
3. Ücretsiz plan yeterli; ortam değişkeni gerekmez, `PORT` Render tarafından verilir.

**Ücretsiz plan uyarısı:** Servis 15 dakika istek almazsa uykuya geçer ve
sonraki istek ~30-50 saniye sürer. Kestirme'nin anında yanıt vermesi için
[cron-job.org](https://cron-job.org) gibi ücretsiz bir servisten 10 dakikada bir
`https://<servis-adin>.onrender.com/` adresine ping atman yeterli.

## iPhone Kestirmesi kurulumu

1. Kestirmeler → yeni kestirme.
2. **Geçerli Konumu Al** eylemini ekle.
3. **URL** eylemi ekle ve şunu yaz (Konum değişkeninden Enlem/Boylam seçerek):
   `https://<servis-adin>.onrender.com/vakit?lat=[Enlem]&lng=[Boylam]&format=text`
   - Enlem/Boylam'ı yazarken değişken ekle → Geçerli Konum → Ayrıntı: Enlem / Boylam.
4. **URL'nin İçeriğini Al** eylemini ekle.
5. **Uyarı Göster** (veya Bildirim Gönder) eylemine gelen sonucu ver.

`format=text` kullanınca gelen yanıt zaten tek satır metin olduğu için ayrıca
JSON ayrıştırmaya gerek kalmaz. JSON tercih edersen `format=text`'i kaldırıp
**Sözlük Değeri Al → displayText** eylemini araya ekle.

Konum izni vermek istemiyorsan URL'yi sabitleyebilirsin:
`.../vakit?il=Antalya&ilce=Gazipaşa&format=text`

## Notlar

- Vakit tabloları 12 saat, ilçe listeleri 30 gün bellekte önbelleklenir; servis
  yeniden başladığında önbellek sıfırlanır.
- Diyanet API'si her sorguda 32 günlük tablo döndürdüğü için gece yarısından
  sonraki "sıradaki vakit: İmsak" durumu ek istek gerektirmez.
- Saat hesapları konumun kendi saat dilimine göre yapılır; sunucunun saat
  dilimi (Render'da UTC) sonucu etkilemez.
