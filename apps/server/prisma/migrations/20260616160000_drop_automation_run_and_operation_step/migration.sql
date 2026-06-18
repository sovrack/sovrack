-- P7 cleanup. Two removals, both on tables that are EMPTY (0 rows) in every env:
--
-- 1) AutomationRun(+Target+Log) : entièrement remplacé par ServerOperation
--    (automation.service / automation-runner écrivent ServerOperation depuis e772e14).
-- 2) ServerOperationStep(+enum) : modèle sans aucun consommateur (l'automation
--    n'utilise que Operation+Target+Log). Retiré au titre de l'anti-facade —
--    ServerJob/ServerPreparation (moteur de concurrence par-serveur) restent la
--    source des « steps/tasks » et ne sont pas fusionnés dans ServerOperation.

-- 1) AutomationRun subsystem (enfants d'abord pour les FK)
DROP TABLE IF EXISTS "AutomationRunLog";
DROP TABLE IF EXISTS "AutomationRunTarget";
DROP TABLE IF EXISTS "AutomationRun";
DROP TYPE IF EXISTS "AutomationRunStatus";
DROP TYPE IF EXISTS "AutomationTargetStatus";

-- 2) ServerOperationStep (inutilisé)
DROP TABLE IF EXISTS "ServerOperationStep";
DROP TYPE IF EXISTS "ServerOperationStepStatus";
