// Test directo del envio - ejecutar dentro del contenedor whatsapp
async function main() {
  const token = process.env.WHATSAPP_INTERNAL_TOKEN || '';
  const phone = '5219618720544';
  const message = 'Prueba directa JW ' + new Date().toISOString().slice(11,19);
  
  console.log('=== Test envio directo ===');
  console.log('Phone:', phone);
  console.log('Token:', token ? token.slice(0,8) + '...' : 'NO TOKEN');
  
  // Test 1: endpoint /send (el basico)
  console.log('\n--- /send ---');
  try {
    const res = await fetch('http://localhost:3010/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-token': token },
      body: JSON.stringify({ phone, message })
    });
    const data = await res.json();
    console.log('Status:', res.status);
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch(e) {
    console.log('Error:', e.message);
  }
}
main();
