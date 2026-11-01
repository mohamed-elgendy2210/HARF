export function sendPrivateReceipt(response, receipt) {
  response
    .set({
      'Content-Type': receipt.mimeType,
      'Content-Length': receipt.buffer.length,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox"
    })
    .send(receipt.buffer);
}
