#!/bin/bash
docker exec jw-reminders-api node -e '
const h = require("http");
h.get("http://localhost:4000/api/automation-center/operations-status", r => {
  let d = "";
  r.on("data", c => d += c);
  r.on("end", () => console.log(d));
});
'
