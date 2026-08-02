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
| [Nominatim](https://nominatim.openstreetmap.org/) | İl/ilçe adı → koordinat (yalnızca `?il=&ilce=` modunda) |
| [Aladhan](https://aladhan.com/prayer-times-api) `method=13` | Yedek kaynak: yurt dışı, eşleşmeyen ilçe veya Diyanet kaynağına ulaşılamadığında |

Öncelik her zaman Diyanet tablosundadır; hangisinin kullanıldığı yanıttaki
`source` alanından görülür. Hiçbiri API anahtarı istemez.

### Diyanet kaynağı Cloudflare arkasında

`ezanvakti.emushaf.net` Cloudflare kullanıyor ve bazı bulut sağlayıcılarının
IP aralıklarına **403** dönüyor (Render'ın ücretsiz planında karşılaşılıyor).
Bu durumda servis hata vermez, yedek kaynağa düşer ve `source: "aladhan"` döner.
Diyanet kaynağı 15 dakika boyunca yeniden denenmez, böylece her istekte boşuna
beklenmez.

Aladhan'ın `method=13`'ü Diyanet'in hesaplama parametrelerini kullanır. Beş ilde
(Antalya, İstanbul, Ankara, İzmir, Erzurum) 30 günlük tablolar karşılaştırıldığında
resmi Diyanet vakitlerinden sapma **en fazla 2 dakika**dır — çoğu günde 0-1 dakika.

Ayna adresi değişirse `DIYANET_BASE` ortam değişkeniyle başka bir adres verilebilir.

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
sonraki istek ~1 dakika sürer. Uyanık tutmak için `/health` ucuna periyodik
ping atmak gerekir.

### Uyanık tutma

Depoda `.github/workflows/keep-alive.yml` var ve push edildiği anda devreye girer;
adres workflow içinde yazılı olduğu için ek kurulum gerekmez (değişirse `SERVICE_URL`
secret'ı tanımlamak yeterli). Ama GitHub Actions bu iş için ideal değil:

- `schedule` tetikleyicisi yoğunlukta **5-30 dakika gecikebiliyor**, yani 10 dakikalık
  aralık pratikte 15 dakikayı aşabilir ve servis yine uyur.
- Depoya **60 gün commit atılmazsa** zamanlanmış workflow'lar sessizce devre dışı
  bırakılır. Kod oturduktan sonra bu neredeyse kesin olarak başına gelir.

Daha güvenilir yol: [cron-job.org](https://cron-job.org) veya
[UptimeRobot](https://uptimerobot.com) üzerinden 10 dakikada bir aynı adrese ping.
İkisi de ücretsiz, gecikmesiz ve kendi kendine kapanmıyor.

**Kota:** Render ücretsiz planda **çalışma alanı başına aylık 750 saat** veriyor.
7/24 uyanık tutmak 744 saat eder — sınırın hemen altı, kotayı aşarsan servis ay
sonuna kadar askıya alınır. Bu yüzden workflow gece 01:00-03:00 arası (TR) ping
atmıyor. Hesabında başka ücretsiz servis varsa aralığı daha da daraltmalısın.

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
- `?il=&ilce=` modunda yer adı önce koordinata çevrilir, sonra koordinatlı akışın
  aynısı çalışır. Yer bulunamazsa 400 döner — yanlış yazılmış bir isim için sessizce
  başka bir konumun vakitleri verilmez.
- Aladhan takvimi ay bazlı döndüğü için ayın son iki gününde sonraki ay da çekilir;
  aksi halde ayın son gecesi "sıradaki vakit" bulunamazdı.
- Aladhan'ın rate limit'i var (429). Geçici hatalarda istek bir kez yeniden denenir.
- Diyanet API'si her sorguda 32 günlük tablo döndürdüğü için gece yarısından
  sonraki "sıradaki vakit: İmsak" durumu ek istek gerektirmez.
- Saat hesapları konumun kendi saat dilimine göre yapılır; sunucunun saat
  dilimi (Render'da UTC) sonucu etkilemez.
