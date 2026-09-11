-- Ver snapshots vs relación real para CBS
SELECT a."assignmentType", a."assignmentNumber",
       a."assignedNameSnapshot" as snapshot_name,
       p."displayName" as current_display,
       p."fullName" as current_full
FROM "JwAssignment" a
LEFT JOIN "JwPublisher" p ON p.id = a."assignedPublisherId"
WHERE a."assignmentType" IN ('CONGREGATION_BIBLE_STUDY_CONDUCTOR', 'CONGREGATION_BIBLE_STUDY_READER')
AND a.status NOT IN ('CANCELLED', 'PROPOSED')
ORDER BY a."meetingWeekId", a."assignmentNumber";
