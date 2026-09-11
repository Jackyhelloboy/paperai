export default async function run(page) {
  // Generate icons via canvas
  const sizes = [192, 512]
  
  for (const size of sizes) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect width="${size}" height="${size}" rx="${size * 0.15}" fill="#2563eb"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" 
            font-family="Arial,sans-serif" font-weight="bold" font-size="${size * 0.4}" fill="white">PA</text>
      <text x="50%" y="75%" dominant-baseline="middle" text-anchor="middle" 
            font-family="Arial,sans-serif" font-size="${size * 0.12}" fill="rgba(255,255,255,0.8)">OCR</text>
    </svg>`
    
    const buf = Buffer.from(svg)
    const fs = await import('fs')
    fs.writeFileSync(`D:/Paper Ai/frontend/public/icon-${size}.png`, buf)
  }
  
  return { done: true }
}
