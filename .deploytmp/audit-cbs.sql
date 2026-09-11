-- Ver todas las asignaciones de tipo CBS en semanas activas
SELECT a."assignmentType", a."assignmentNumber", a.title, a.status,
       p."displayName" as assigned_name, p."fullName" as assigned_full,
       c."displayName" as companion_name
FROM "JwAssignment" a
LEFT JOIN "JwPublisher" p ON p.id = a."assignedPublisherId"
LEFT JOIN "JwPublisher" c ON c.id = a."companionPublisherId"
WHERE a."assignmentType" IN ('CONGREGATION_BIBLE_STUDY_CONDUCTOR', 'CONGREGATION_BIBLE_STUDY_READER')
AND a.status NOT IN ('CANCELLED', 'PROPOSED')
ORDER BY a."meetingWeekId", a."assignmentNumber";

-- Ver si hay asignaciones cuyo titulo contiene "estudio" o "lector"
SELECT a."assignmentType", a."assignmentNumber", a.title, a.status,
       p."displayName" as assigned_name
FROM "JwAssignment" a
LEFT JOIN "JwPublisher" p ON p.id = a."assignedPublisherId"
WHERE (lower(a.title) LIKE '%estudio%' OR lower(a.title) LIKE '%lector%')
AND a.status NOT IN ('CANCELLED', 'PROPOSED')
ORDER BY a."meetingWeekId", a."assignmentNumber";
