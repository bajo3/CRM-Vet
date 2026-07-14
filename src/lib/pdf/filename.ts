/** Genera un nombre de archivo prolijo (sin tildes, espacios ni caracteres raros) para el `Content-Disposition`. */
export function slugifyForFilename(text: string): string {
  const withoutAccents = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const slug = withoutAccents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "documento";
}
