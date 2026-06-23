import { Router, Request, Response } from "express";
import { prisma } from "@jw-reminders/database";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const { status, publisherId, assignmentId } = req.query;
  res.json(await prisma.jwMessageLog.findMany({
    where: {
      ...(status && { status: status as any }),
      ...(publisherId && { publisherId: publisherId as string }),
      ...(assignmentId && { assignmentId: assignmentId as string }),
    },
    include: { publisher: true, assignment: true },
    orderBy: { createdAt: "desc" },
  }));
});

export default router;
