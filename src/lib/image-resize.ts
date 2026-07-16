/**
 * Redimensiona una imagen elegida en el navegador (canvas) antes de guardarla como data URL, para no
 * mandar fotos pesadas de cámara al servidor. Solo corre en cliente.
 *
 * PNG (sin pérdida) se reserva para logos con transparencia; las fotos van en JPEG comprimido, que
 * para una foto de cámara real pesa una fracción de lo que pesaría en PNG — una foto de varios MB
 * fácilmente superaba el límite de tamaño del campo cuando se guardaba sin comprimir.
 */
export function resizeImageToDataUrl(file: File, maxSide: number, format: "image/png" | "image/jpeg" = "image/png", quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No se pudo procesar la imagen."));
      if (format === "image/jpeg") {
        // JPEG no soporta transparencia: fondo blanco para que no quede negro donde había alpha.
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(format, quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = URL.createObjectURL(file);
  });
}
