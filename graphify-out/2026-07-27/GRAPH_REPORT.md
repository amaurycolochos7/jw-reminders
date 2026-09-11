# Graph Report - .  (2026-07-16)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 2123 nodes · 3370 edges · 163 communities (126 shown, 37 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 74 edges (avg confidence: 0.74)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `05b7e7bb`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- monthly-schedules.service.ts
- operational-center.service.ts
- app.js
- wol-resolver.service.ts
- s140-export.service.ts
- process-reminders.ts
- index.ts
- dependencies
- wol-importer.service.ts
- index.ts
- AssignmentForm.tsx
- generate-precursor-index.ts
- assignment-proposal.ts
- whatsapp.ts
- publication
- dependencies
- routes.py
- package.json
- package.json
- scripts
- index.ts
- compilerOptions
- package.json
- page.tsx
- index.ts
- api
- WeekGenerationModal.tsx
- dependencies
- topic-search.service.ts
- SessionManager
- compilerOptions
- compilerOptions
- index.ts
- page.tsx
- page.tsx
- workflow-icons.tsx
- compilerOptions
- compilerOptions
- openai.service.ts
- index.ts
- package.json
- index.ts
- download-bible-nwt.ts
- compilerOptions
- page.tsx
- precursor-matcher.service.ts
- page.tsx
- index.ts
- enricher.py
- qualifier.py
- index.ts
- index.ts
- _audit_references.ts
- research-chat.routes.ts
- grouped-message.test.ts
- database.py
- index.ts
- api_run_pipeline
- manual-send.service.ts
- page.tsx
- extractor.py
- _analyze_wol_w10_article.js
- publishers.service.ts
- WeekAutomations.tsx
- index.ts
- _crack_bible.js
- assignments.routes.ts
- send-research-message.ts
- _test_topic_search.ts
- page.tsx
- AssignmentReminders.tsx
- models.py
- manifest.json
- _analyze_wol_w2006_article.js
- index.ts
- tsconfig.json
- issueProperties
- _analyze_wol_w10.js
- _test_fase78.ts
- _test_matcher.ts
- page.tsx
- _analyze_bible3.js
- _analyze_wol_full.js
- _analyze_wol_w2006.js
- _evidence_fase5.js
- fix-templates-encoding.ts
- inspect-precursor-jwpub.ts
- auth.service.ts
- index.ts
- page.tsx
- page.tsx
- seed.ts
- _analyze_bible.js
- _analyze_bible5.js
- _test_bible_resolver.js
- page.tsx
- index.ts
- index.ts
- config.py
- _analyze_bible2.js
- _analyze_bible4.js
- _analyze_bible_nwt.js
- _analyze_wol.js
- _audit_bible_local.js
- _explore_pt14.js
- migrate-templates-spintax.ts
- reminders.routes.ts
- migration-safety.test.ts
- Sidebar.tsx
- message-templates.routes.ts
- publishers.routes.ts
- index.ts
- source-gating.test.ts
- layout.tsx
- re_extract.py
- source-integrity.test.ts
- next.config.js
- next-env.d.ts
- tailwind.config.ts
- types.d.ts
- check-api.sh
- check-deploy.sh
- deployA.sh
- deployA2.sh
- deployA2.lf.sh
- deployA.lf.sh
- dokinv.sh
- dokinv2.sh
- dokinv2.lf.sh
- dokinv3.sh
- dokinv3.lf.sh
- dokinv.lf.sh
- fix-pg-auth.sh
- trigger-deploy.sh
- globalForPrisma
- categories
- extract_mx.py
- extract_us.py
- backup-db.sh
- db-migrate.sh
- db-seed.sh
- deploy.sh
- fix-db-remote.sh
- healthcheck.sh
- test_prod.js

## God Nodes (most connected - your core abstractions)
1. `api()` - 39 edges
2. `publication` - 35 edges
3. `createAutomationEvent()` - 28 edges
4. `Lead` - 25 edges
5. `createAutomationPlanForAssignment()` - 19 edges
6. `resolveWolReference()` - 19 edges
7. `runProcessReminders()` - 19 edges
8. `apiGet()` - 18 edges
9. `getOperationalCenter()` - 18 edges
10. `generateS140()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `AssignmentForm()` --indirect_call--> `part()`  [INFERRED]
  apps/web/src/app/dashboard/semanas/[id]/AssignmentForm.tsx → packages/shared/src/grouped-message/list.test.ts
- `groupDeliveries()` --indirect_call--> `d()`  [INFERRED]
  packages/shared/src/delivery-grouping/index.ts → apps/worker/src/services/grouping.test.ts
- `main()` --references--> `jszip`  [EXTRACTED]
  scripts/_inspect_s140_template.ts → apps/api/package.json
- `main()` --calls--> `resolveReferences()`  [EXTRACTED]
  scripts/_test_e2e_source_resolution.ts → apps/api/src/services/research-chat/wol-resolver.service.ts
- `testResolver()` --calls--> `resolveReferences()`  [EXTRACTED]
  scripts/_test_manual_fallback.ts → apps/api/src/services/research-chat/wol-resolver.service.ts

## Import Cycles
- None detected.

## Communities (163 total, 37 thin omitted)

### Community 0 - "monthly-schedules.service.ts"
Cohesion: 0.06
Nodes (73): call(), cleanup(), main(), ok(), sleep(), startFakeWhatsApp(), waReceived, cancelAssignment() (+65 more)

### Community 1 - "operational-center.service.ts"
Cohesion: 0.06
Nodes (63): cleanup(), log(), main(), received, startFakeWhatsApp(), deliveryInclude, isOpenNotSent(), mapDelivery() (+55 more)

### Community 2 - "app.js"
Cohesion: 0.10
Nodes (59): analyzeAllCategories(), analyzeCategory(), apiDelete(), apiGet(), apiPost(), checkGestionWAStatus(), checkWAStatus(), closeModal() (+51 more)

### Community 3 - "wol-resolver.service.ts"
Cohesion: 0.07
Nodes (53): main(), resolveTextReferences(), resolveSource(), BIBLE_BOOK_NUMBERS, BibleBook, BibleChapter, BibleData, BibleVerse (+45 more)

### Community 4 - "s140-export.service.ts"
Cohesion: 0.07
Nodes (45): main(), main(), jszip, createSchema, generateWeeksSchema, localDate(), meetingDatesForMonth(), router (+37 more)

### Community 5 - "process-reminders.ts"
Cohesion: 0.09
Nodes (46): f(), main(), autoPauseSends(), BATCH_SIZE, claimGroup(), delay(), deliveryToMessagePart(), envInt() (+38 more)

### Community 6 - "index.ts"
Cohesion: 0.07
Nodes (45): classifyIntent(), CompoundQuestionResult, DetectedQuestion, determineSourceStatus(), INTENT_PATTERNS, parseCompoundQuestion(), QuestionIntent, ResponseValidation (+37 more)

### Community 7 - "dependencies"
Cohesion: 0.04
Nodes (44): dependencies, bcryptjs, cors, express, helmet, jsonwebtoken, @jw-reminders/database, @jw-reminders/shared (+36 more)

### Community 8 - "wol-importer.service.ts"
Cohesion: 0.08
Nodes (37): createSchema, router, updateSchema, Anchor, decodeEntities(), ensureCbsReaderPart(), ensureStandardMeetingParts(), ENTITIES (+29 more)

### Community 9 - "index.ts"
Cohesion: 0.11
Nodes (33): appendParts(), assembleMessageVariables(), buildGroupedPersonMessage(), buildInitialAssignmentsList(), buildMonthlyInitialMessage(), buildReminderAssignmentsList(), capitalize(), dateHeader() (+25 more)

### Community 10 - "AssignmentForm.tsx"
Cohesion: 0.09
Nodes (34): AssignmentRow(), Assignment, AssignmentForm(), emptyForm, nextNumber(), Props, Publisher, ROOMS (+26 more)

### Community 11 - "generate-precursor-index.ts"
Cohesion: 0.06
Nodes (32): allBibleCits, allExtracts, BibleCitRow, bibleCitsByDoc, dayItems, dayMap, db, DB_PATH (+24 more)

### Community 12 - "assignment-proposal.ts"
Cohesion: 0.09
Nodes (26): autofillOpeningPartsFromChairman(), buildAssignmentProposal(), DATASET, HISTORY, idsFor(), READING, STUDENT, TALK (+18 more)

### Community 13 - "whatsapp.ts"
Cohesion: 0.16
Nodes (29): AckWaiter, ackWaiters, cleanChromiumLocks(), client, createClient(), disconnectSession(), generateQR(), getClient() (+21 more)

### Community 14 - "publication"
Cohesion: 0.06
Nodes (33): publication, attributes, displayTitle, displayTitleRich, englishSymbol, fileName, hash, images (+25 more)

### Community 15 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, autoprefixer, @jw-reminders/shared, next, postcss, react, react-dom, tailwindcss (+23 more)

### Community 16 - "routes.py"
Cohesion: 0.12
Nodes (30): api_bulk_delete_by_keyword(), api_bulk_delete_with_website(), api_bulk_mark_contacted(), api_categories(), api_clean_category(), api_delete_lead(), api_export_csv(), api_get_lead() (+22 more)

### Community 17 - "package.json"
Cohesion: 0.07
Nodes (29): dependencies, express, @jw-reminders/database, @jw-reminders/shared, qrcode-terminal, whatsapp-web.js, devDependencies, tsx (+21 more)

### Community 18 - "package.json"
Cohesion: 0.07
Nodes (29): dependencies, bcryptjs, @prisma/client, devDependencies, prisma, tsx, @types/bcryptjs, typescript (+21 more)

### Community 19 - "scripts"
Cohesion: 0.07
Nodes (28): description, devDependencies, better-sqlite3, @types/better-sqlite3, engines, node, pnpm, better-sqlite3 (+20 more)

### Community 20 - "index.ts"
Cohesion: 0.13
Nodes (20): AssistantCard(), HighlightedText(), PHRASES, STEP_MAP, SourceCard(), ChatMessage, ExtractedParagraph, GeneratedComment (+12 more)

### Community 21 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+18 more)

### Community 22 - "package.json"
Cohesion: 0.07
Nodes (26): dependencies, @jw-reminders/database, @jw-reminders/shared, node-cron, devDependencies, tsx, @types/node, @types/node-cron (+18 more)

### Community 23 - "page.tsx"
Cohesion: 0.12
Nodes (22): APPOINTMENT_LABEL, BASIC_CAPS, emptyForm, FormState, MEETING_CAPS, PublicadoresPage(), Publisher, toNational() (+14 more)

### Community 24 - "index.ts"
Cohesion: 0.12
Nodes (21): ASSIGNMENT_TYPE_OPTIONS, ASSIGNMENT_TYPE_REQUIRED_CAPABILITY, ASSIGNMENT_TYPE_RULES, AssignmentRole, AssignmentTypeOption, AssignmentTypeRule, CHAIRMAN_AUTOFILL_TYPES, deriveDurationMinutes() (+13 more)

### Community 25 - "api"
Cohesion: 0.13
Nodes (16): Config, MessageLog, statusConfig, WAStatus, WhatsAppPage(), deleteSession(), fetchSession(), fetchSessions() (+8 more)

### Community 26 - "WeekGenerationModal.tsx"
Cohesion: 0.14
Nodes (19): MONTHS, Progress, Props, shortDate(), WeekGenerationModal(), WeekProgress, ProgramItem, referenceAndLesson() (+11 more)

### Community 27 - "dependencies"
Cohesion: 0.09
Nodes (22): dotenv, pino, qrcode, dependencies, cors, dotenv, express, pino (+14 more)

### Community 28 - "topic-search.service.ts"
Cohesion: 0.19
Nodes (20): BibleDoc, bm25Score(), detectExplicitReferences(), __dirname, DOCTRINAL_TOPIC_MAP, expandQuery(), getDoctrinalBoosts(), getRelatedTerms() (+12 more)

### Community 29 - "SessionManager"
Cohesion: 0.13
Nodes (9): app, cors, dns, express, sm, { Client, LocalAuth }, fs, QRCode (+1 more)

### Community 30 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule (+11 more)

### Community 31 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule (+11 more)

### Community 32 - "index.ts"
Cohesion: 0.16
Nodes (10): assertSecurityConfig(), getJwtSecret(), rateLimit(), authMiddleware(), router, router, router, apiRouter (+2 more)

### Community 33 - "page.tsx"
Cohesion: 0.14
Nodes (14): Alert, DashboardPage(), MONTHS_LONG, OperationalCenter, parseLocalDate(), relativeSync(), Severity, severityDot() (+6 more)

### Community 34 - "page.tsx"
Cohesion: 0.15
Nodes (18): Assignment, formatDate(), groupAssignmentsBySection(), MeetingWeek, monthName(), ProgramItem, Publisher, Reminder (+10 more)

### Community 35 - "workflow-icons.tsx"
Cohesion: 0.21
Nodes (13): BellAlertIcon(), CalendarPlusIcon(), ClipboardListIcon(), IconProps, InboxIcon(), LayersIcon(), PersonIcon(), PhoneIcon() (+5 more)

### Community 36 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule (+10 more)

### Community 37 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, declaration, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir, resolveJsonModule (+10 more)

### Community 38 - "openai.service.ts"
Cohesion: 0.15
Nodes (17): AiRunMetadata, AssistantResponse, buildSystemPrompt(), buildUserPrompt(), callOpenAI(), GeneratedComment, GenerateOptions, generateResearchResponse() (+9 more)

### Community 39 - "index.ts"
Cohesion: 0.16
Nodes (12): Button(), ButtonProps, Card(), CardProps, EmptyState(), EmptyStateProps, Input(), InputProps (+4 more)

### Community 40 - "package.json"
Cohesion: 0.11
Nodes (17): devDependencies, @types/node, typescript, exports, ./whatsapp, @types/node, typescript, main (+9 more)

### Community 41 - "index.ts"
Cohesion: 0.22
Nodes (17): AssignmentTypeId, SectionId, buildWolMeetingsUrl(), getIsoWeekEnd(), getIsoWeekNumber(), getIsoWeekStart(), getIsoWeekYear(), getWolWeekCoordinates() (+9 more)

### Community 42 - "download-bible-nwt.ts"
Cohesion: 0.16
Nodes (17): BibleBook, BibleChapter, BibleData, BOOKS, decode(), delay(), extractVerses(), fetchChapter() (+9 more)

### Community 43 - "compilerOptions"
Cohesion: 0.12
Nodes (16): build, compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution (+8 more)

### Community 44 - "page.tsx"
Cohesion: 0.17
Nodes (10): completion(), emptyForm, formatDate(), formatDateShort(), MeetingWeek, SemanasPage(), STATUS_META, ConfirmModalProps (+2 more)

### Community 45 - "precursor-matcher.service.ts"
Cohesion: 0.18
Nodes (14): INDEX, IndexExtract, IndexFile, IndexLesson, IndexReference, jaccard(), NO_MATCH, normalize() (+6 more)

### Community 46 - "page.tsx"
Cohesion: 0.16
Nodes (10): AutomatizacionesPage(), fmtTimer(), OpsStatus, SendGroup, TYPE_LABELS, WorkerPhase, Badge(), BadgeProps (+2 more)

### Community 47 - "index.ts"
Cohesion: 0.31
Nodes (9): EmptyState(), CloseIcon(), PlusIcon(), SearchIcon(), SidebarIcon(), LoadingIndicator(), ConversationList(), SidebarPanelContents() (+1 more)

### Community 48 - "enricher.py"
Cohesion: 0.16
Nodes (14): api_enrich(), Enrich qualified leads with WhatsApp links and emails., enrich_leads(), extract_domain(), find_email_hunter(), generate_whatsapp_link(), generate_whatsapp_message(), AsyncSession (+6 more)

### Community 49 - "qualifier.py"
Cohesion: 0.16
Nodes (14): api_qualify(), api_requalify(), api_stats(), Run qualification filters on new leads., Reset and re-run qualification with new parameters., Get pipeline statistics., get_qualification_stats(), AsyncSession (+6 more)

### Community 50 - "index.ts"
Cohesion: 0.18
Nodes (11): GenderValue, AppointmentValue, CAPABILITIES, CAPABILITY_LABEL, CapabilityKey, CapabilityMeta, isValidPublisherCapabilities(), MALE_ONLY_CAPABILITIES (+3 more)

### Community 51 - "index.ts"
Cohesion: 0.14
Nodes (13): AssignmentSection, AssignmentStatus, AssignmentType, AutomationPlanStatus, Gender, MeetingWeekStatus, MessageLogStatus, MonthlyScheduleStatus (+5 more)

### Community 52 - "_audit_references.ts"
Cohesion: 0.20
Nodes (13): auditFormats(), AuditItem, auditReference(), fetchWol(), generateMarkdown(), INDEX, INDEX_PATH, JSON_OUT (+5 more)

### Community 53 - "research-chat.routes.ts"
Cohesion: 0.21
Nodes (6): AuthRequest, createPromptRule(), listPromptRules(), featureGuard(), isResearchChatEnabled(), router

### Community 54 - "grouped-message.test.ts"
Cohesion: 0.15
Nodes (10): CONCLUSION, EBC_COND, EBC_LECTOR, LECTURA, NVC, PERLAS, PRESIDENTE, SMM_AYUDANTE (+2 more)

### Community 55 - "database.py"
Cohesion: 0.18
Nodes (10): FastAPI, get_session(), init_db(), AsyncSession, Database setup with SQLAlchemy async engine and session management. Uses SQLite, Create all tables on startup., Dependency for FastAPI routes., lifespan() (+2 more)

### Community 56 - "index.ts"
Cohesion: 0.15
Nodes (3): ASSIGNMENT_TYPE_LABELS, REMINDER_TYPE_LABELS, ROOM_LABELS

### Community 57 - "api_run_pipeline"
Cohesion: 0.19
Nodes (12): api_generate_outreach(), api_generate_outreach_single(), api_run_pipeline(), Generate personalized outreach messages., Generate outreach for a single lead., Run phases 2, 3, and 4 sequentially on existing leads., generate_outreach(), generate_outreach_manual() (+4 more)

### Community 58 - "manual-send.service.ts"
Cohesion: 0.33
Nodes (9): ACTIVE, doSend(), getSendGuard(), internalHeaders(), normalizePhoneDigits(), renderTemplateForTest(), SendGuard, sendManual() (+1 more)

### Community 59 - "page.tsx"
Cohesion: 0.20
Nodes (11): ConfirmState, formatDate(), formatDateShort(), Metrics, MONTHS, PROGRAM_STATUS, ProgramDetail, ProgramDetailPage() (+3 more)

### Community 60 - "extractor.py"
Cohesion: 0.18
Nodes (11): api_extract(), api_import_json(), Start an extraction from Apify Google Maps Scraper., Import leads from a JSON file (downloaded from Apify console)., import_from_json(), AsyncSession, Phase 1: Lead Extraction using Apify Google Maps Scraper. Connects to the Apify, Import leads from a previously downloaded Apify JSON file.     Useful if you alr (+3 more)

### Community 61 - "_analyze_wol_w10_article.js"
Cohesion: 0.17
Nodes (10): boxClasses, boxDiv, duColorMatches, fs, h1, html, path, ruleAbove (+2 more)

### Community 62 - "publishers.service.ts"
Cohesion: 0.29
Nodes (5): createPublisher(), normalizePhone(), toNationalPhone(), updatePublisher(), validatePhone()

### Community 63 - "WeekAutomations.tsx"
Cohesion: 0.20
Nodes (8): Delivery, fmt(), Props, STATUS_MAP, Summary, TYPE_LABELS, TYPE_ORDER, WeekAutomations()

### Community 64 - "index.ts"
Cohesion: 0.24
Nodes (7): canEditMessage(), canReschedule(), canSendNow(), EDITABLE_MESSAGE_STATES, ReminderStatusValue, RESCHEDULE_STATES, SEND_NOW_STATES

### Community 65 - "_crack_bible.js"
Cohesion: 0.18
Nodes (10): biblePub, bp, ch, Database, db, knownStarts, methods, pub (+2 more)

### Community 66 - "assignments.routes.ts"
Cohesion: 0.27
Nodes (8): createSchema, router, updateSchema, activeBody(), AssignmentMessagePreview, getAssignmentMessagePreview(), MESES_ES_LOWER, personName()

### Community 67 - "send-research-message.ts"
Cohesion: 0.36
Nodes (7): regenerateComment(), RegenerateCommentInput, sendResearchMessage(), SendResearchMessageInput, ResearchChatOptions, matchPrecursorQuestion(), TopicSearchResult

### Community 68 - "_test_topic_search.ts"
Cohesion: 0.27
Nodes (5): buildMetadataFromSource(), normalizeOrigin(), ValidatedSource, validateSources(), ValidationResult

### Community 69 - "page.tsx"
Cohesion: 0.24
Nodes (9): ConfirmState, formatDateShort(), Proposal, ProposalAssignment, ProposalPage(), ProposalWeek, Publisher, PubRef (+1 more)

### Community 70 - "AssignmentReminders.tsx"
Cohesion: 0.22
Nodes (9): Assignment, AssignmentReminders(), formatDateTime(), MessagePreview, Props, Publisher, Reminder, REMINDER_DAY_LABELS (+1 more)

### Community 71 - "models.py"
Cohesion: 0.24
Nodes (9): DeclarativeBase, api_bulk_delete_all(), api_searches(), List all search history., Delete ALL leads. Use with caution., Base, OutreachLog, SQLAlchemy models for the Lead Pipeline database. (+1 more)

### Community 72 - "manifest.json"
Cohesion: 0.20
Nodes (9): contentFormat, expandedSize, hash, htmlValidated, mepsBuildNumber, mepsPlatformVersion, name, timestamp (+1 more)

### Community 73 - "_analyze_wol_w2006_article.js"
Cohesion: 0.20
Nodes (8): allFootnoteContent, fnDivs, fnPs, fs, groupFn, html, noteIdx, t

### Community 74 - "index.ts"
Cohesion: 0.33
Nodes (4): createConversation(), deleteConversation(), getConversation(), listConversations()

### Community 75 - "tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, rootDir, extends, include, src/**/*, prisma/**/*, ../../tsconfig.json

### Community 76 - "issueProperties"
Cohesion: 0.22
Nodes (9): coverTitle, coverTitleRich, symbol, title, titleRich, undatedSymbol, undatedTitle, undatedTitleRich (+1 more)

### Community 77 - "_analyze_wol_w10.js"
Cohesion: 0.22
Nodes (7): boxPatterns, fs, h1, html, links, noteMatch, path

### Community 78 - "_test_fase78.ts"
Cohesion: 0.36
Nodes (8): INDEX, main(), matchPrecursorQuestion(), normalize(), normalizeRef(), { parseAllReferences }, resolveWolRefs(), simulateEndpoint()

### Community 79 - "_test_matcher.ts"
Cohesion: 0.36
Nodes (8): INDEX, jaccard(), match(), normalize(), normalizeRef(), { parseWolReferences }, tests, tokenize()

### Community 80 - "page.tsx"
Cohesion: 0.29
Nodes (6): Batch, MensajesPage(), Msg, renderWhatsapp(), Schedule, TYPES

### Community 81 - "_analyze_bible3.js"
Cohesion: 0.25
Nodes (7): fs, html, idx, orenIdx, ustedesIdx, v10idx, v9idx

### Community 82 - "_analyze_wol_full.js"
Cohesion: 0.25
Nodes (6): allParagraphs, fs, h1Match, html, path, result

### Community 83 - "_analyze_wol_w2006.js"
Cohesion: 0.25
Nodes (7): fnMarker, fnMatch, fnPatterns, fs, html, links, t

### Community 84 - "_evidence_fase5.js"
Cohesion: 0.25
Nodes (7): evidence, fs, path, w10_html, w10_title_m, w2006_html, w2006_title_m

### Community 85 - "fix-templates-encoding.ts"
Cohesion: 0.39
Nodes (7): extractVariableNames(), hasMojibake(), hasSpintax(), isAlreadyCorrect(), main(), prisma, SPINTAX_BODIES

### Community 86 - "inspect-precursor-jwpub.ts"
Cohesion: 0.25
Nodes (7): db, DB_PATH, docSample, importantTables, indexes, questionTable, tables

### Community 87 - "auth.service.ts"
Cohesion: 0.43
Nodes (5): loginSchema, router, isBcrypt(), login(), sha256()

### Community 89 - "page.tsx"
Cohesion: 0.33
Nodes (6): PlantillasPage(), renderWhatsapp(), Template, TYPE_LABEL, VariableDef, Version

### Community 90 - "page.tsx"
Cohesion: 0.38
Nodes (6): MonthlySchedule, MONTHS, ProgramasPage(), statusClass(), statusLabel(), WEEK_DAYS

### Community 91 - "seed.ts"
Cohesion: 0.38
Nodes (6): ACTIVE_TEMPLATES, ensureActiveTemplate(), extractVariableNames(), LEGACY_TYPES, main(), prisma

### Community 92 - "_analyze_bible.js"
Cohesion: 0.29
Nodes (6): fs, html, idx10, idx9, patterns, sal83idx

### Community 93 - "_analyze_bible5.js"
Cohesion: 0.29
Nodes (6): fs, html, orenIdx, scriptureSection, v10text, verseParagraphs

### Community 94 - "_test_bible_resolver.js"
Cohesion: 0.43
Nodes (6): BIBLE_BOOK_NUMBERS, decode(), fs, main(), parseVerseNumbers(), resolveBible()

### Community 95 - "page.tsx"
Cohesion: 0.40
Nodes (5): EnviarPage(), Publisher, renderWhatsapp(), SendState, Template

### Community 96 - "index.ts"
Cohesion: 0.33
Nodes (4): NotificationClassification, NotificationTypeValue, REMINDER_KEYS, ReminderTypeValue

### Community 97 - "index.ts"
Cohesion: 0.47
Nodes (5): buildIdempotencyKey(), contentHash(), SendOutcome, SendResult, sha256Hex()

### Community 99 - "_analyze_bible2.js"
Cohesion: 0.33
Nodes (5): fs, html, nineIdx, nineIdx2, nineIdx3

### Community 100 - "_analyze_bible4.js"
Cohesion: 0.33
Nodes (5): bodyHtml, fs, html, pidElements, verseRegion

### Community 101 - "_analyze_bible_nwt.js"
Cohesion: 0.33
Nodes (5): allPids, fs, html, padreIdx, searches

### Community 102 - "_analyze_wol.js"
Cohesion: 0.33
Nodes (5): fs, html, links, path, titleMatch

### Community 103 - "_audit_bible_local.js"
Cohesion: 0.33
Nodes (5): Database, db, important, mateo6, tables

### Community 104 - "_explore_pt14.js"
Cohesion: 0.33
Nodes (5): allDocs, Database, db, leccion3A, viewItems

### Community 105 - "migrate-templates-spintax.ts"
Cohesion: 0.47
Nodes (5): extractVariableNames(), hasSpintax(), main(), prisma, SPINTAX_BODIES

### Community 107 - "migration-safety.test.ts"
Cohesion: 0.40
Nodes (4): EXISTING_TABLES, here, MIGRATION, sql

### Community 109 - "message-templates.routes.ts"
Cohesion: 0.50
Nodes (3): ACTIVE, router, updateSchema

### Community 110 - "publishers.routes.ts"
Cohesion: 0.50
Nodes (3): createSchema, router, updateSchema

### Community 111 - "index.ts"
Cohesion: 0.67
Nodes (3): GroupableDelivery, groupDeliveries(), groupKey()

## Knowledge Gaps
- **818 isolated node(s):** `check-api.sh script`, `check-deploy.sh script`, `deployA.lf.sh script`, `deployA.sh script`, `deployA2.lf.sh script` (+813 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `d()` connect `process-reminders.ts` to `operational-center.service.ts`, `page.tsx`, `index.ts`, `page.tsx`, `page.tsx`, `WeekAutomations.tsx`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **Why does `api()` connect `api` to `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `AssignmentReminders.tsx`, `AssignmentForm.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `page.tsx`, `WeekGenerationModal.tsx`, `page.tsx`, `WeekAutomations.tsx`, `page.tsx`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **Why does `groupDeliveries()` connect `index.ts` to `process-reminders.ts`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 22 inferred relationships involving `Lead` (e.g. with `api_bulk_delete_all()` and `api_bulk_delete_by_keyword()`) actually correct?**
  _`Lead` has 22 INFERRED edges - model-reasoned connections that need verification._
- **What connects `check-api.sh script`, `check-deploy.sh script`, `deployA.lf.sh script` to the rest of the system?**
  _818 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `monthly-schedules.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.057946069994262765 - nodes in this community are weakly interconnected._
- **Should `operational-center.service.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0649452269170579 - nodes in this community are weakly interconnected._