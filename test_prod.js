const url = 'http://localhost:3010/send-with-typing-and-ack';
const body = JSON.stringify({phone:'5219618720544',message:'Test envio prod'});
fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2))).catch(e=>console.log('ERR:'+e.message));
