/**
 * Türkçe yer adlarını karşılaştırır: aksan, büyük/küçük harf ve
 * "İ/I", "ı/i" farkları API'ler arasında tutarsız olduğu için hepsini sadeleştiriyoruz.
 */
export function matches(a, b) {
  return a != null && b != null && normalize(a) === normalize(b);
}

export function normalize(value) {
  return String(value)
    .toLocaleLowerCase('tr')
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Diyanet API'si yer adlarını "GAZİPAŞA" gibi tamamen büyük harf döndürüyor.
 * Ekranda gösterilmeden önce başlık biçimine çeviriyoruz; zaten karışık yazılmış
 * adlara (Nominatim/Open-Meteo çıktıları) dokunmuyoruz.
 */
export function titleCase(value) {
  if (!value) return value;
  if (value !== value.toLocaleUpperCase('tr')) return value;

  return value
    .toLocaleLowerCase('tr')
    .replace(/(^|[\s\-'/(])([\p{L}])/gu, (_, ayrac, harf) => ayrac + harf.toLocaleUpperCase('tr'));
}
