import { PrismaClient } from "@prisma/client";
import { createHash } from "crypto";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex");
}

const templates = [
  {
    type: "INITIAL_NOTICE_ASSIGNED",
    title: "Aviso inicial (asignado)",
    body: `Saludos, {{assignedName}}.

Se le ha asignado la siguiente participación:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Tipo: {{assignmentType}}
Duración: {{duration}}
Contexto: {{context}}
Referencia: {{reference}}
Fecha: {{meetingDate}}
Hora: {{meetingTime}}
Sala: {{room}}
Acompañante: {{companionName}}

Por favor confirme que recibió este aviso.
Cualquier duda o inconveniente, comuníquese con anticipación.`,
  },
  {
    type: "INITIAL_NOTICE_COMPANION",
    title: "Aviso inicial (acompañante)",
    body: `Saludos, {{companionName}}.

Ha sido asignado(a) como acompañante de {{assignedName}}:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Tipo: {{assignmentType}}
Fecha: {{meetingDate}}
Hora: {{meetingTime}}
Sala: {{room}}
Contexto: {{context}}

Por favor coordínense para la presentación.`,
  },
  {
    type: "SEVEN_DAYS_BEFORE",
    title: "Recordatorio 7 días",
    body: `Saludos, {{assignedName}}.

Le recordamos que en una semana tiene la siguiente participación:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Fecha: {{meetingDate}}
Sala: {{room}}
Referencia: {{reference}}

Le animamos a prepararse con tiempo.`,
  },
  {
    type: "THREE_DAYS_BEFORE",
    title: "Recordatorio 3 días",
    body: `Saludos, {{assignedName}}.

Su participación es en 3 días:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Fecha: {{meetingDate}} - {{meetingTime}}
Sala: {{room}}
Duración: {{duration}}
Acompañante: {{companionName}}

Si tiene algún inconveniente, avísenos con la mayor brevedad posible.`,
  },
  {
    type: "ONE_DAY_BEFORE",
    title: "Recordatorio 1 día",
    body: `Saludos, {{assignedName}}.

Mañana tiene su participación en la reunión:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Hora: {{meetingTime}}
Sala: {{room}}
Duración: {{duration}}

Le deseamos éxito. Recuerde llegar puntual.`,
  },
  {
    type: "SAME_DAY",
    title: "Recordatorio mismo día",
    body: `Saludos, {{assignedName}}.

Hoy es su participación en la reunión:

Asignación {{assignmentNumber}}: {{assignmentTitle}}
Hora: {{meetingTime}}
Sala: {{room}}

Éxito en su presentación.`,
  },
  {
    type: "CHANGE_NOTICE",
    title: "Cambio de asignación",
    body: `Saludos, {{assignedName}}.

Ha habido un cambio en su asignación:

Nueva asignación: {{assignmentTitle}}
Tipo: {{assignmentType}}
Fecha: {{meetingDate}} - {{meetingTime}}
Sala: {{room}}
Duración: {{duration}}
Referencia: {{reference}}
Acompañante: {{companionName}}

{{notes}}

Disculpe las molestias.`,
  },
  {
    type: "CANCELLATION_NOTICE",
    title: "Cancelación",
    body: `Saludos, {{assignedName}}.

Su asignación del {{meetingDate}} ha sido cancelada:
Asignación {{assignmentNumber}}: {{assignmentTitle}}

{{notes}}

Agradecemos su buena disposición.`,
  },
];

async function main() {
  // Create admin user
  await prisma.adminUser.upsert({
    where: { email: "admin" },
    update: {},
    create: {
      email: "admin",
      password: hashPassword("dorian123"),
      name: "Administrador",
    },
  });
  console.log("✓ Admin user created");

  // Create message templates
  for (const t of templates) {
    await prisma.jwMessageTemplate.upsert({
      where: { type: t.type },
      update: { body: t.body, title: t.title },
      create: t,
    });
  }
  console.log("✓ Message templates created");

  // Create default config
  const defaults = [
    { key: "TIMEZONE", value: "America/Mexico_City" },
    { key: "REMINDER_SEND_HOUR", value: "9" },
    { key: "CONGREGATION_NAME", value: "" },
  ];
  for (const c of defaults) {
    await prisma.appConfig.upsert({
      where: { key: c.key },
      update: {},
      create: c,
    });
  }
  console.log("✓ Default config created");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
