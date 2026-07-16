/** Redimensiona una imagen elegida en el navegador (canvas) antes de guardarla como data URL, para no mandar fotos pesadas de cámara al servidor. Solo corre en cliente. */
export function resizeImageToDataUrl(file: File, maxSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("No se pudo procesar la imagen."));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error("No se pudo leer la imagen."));
    img.src = URL.createObjectURL(file);
  });
}
