// Test del endpoint /send-with-typing-and-ack
async function main() {
  const token = process.env.WHATSAPP_INTERNAL_TOKEN || '';
  const phone = '5219618720544';
  const message = 'Prueba typing+ack ' + new Date().toISOString().slice(11,19);
  
  console.log('=== Test /send-with-typing-and-ack ===');
  console.log('Phone:', phone);
  
  try {
    const res = await fetch('http://localhost:3010/send-with-typing-and-ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': token },
      body: JSON.stringify({ phone, message, waitForAckSeconds: 30 })
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch(e) {
    console.log('Error:', e.message);
  }
}
main();
