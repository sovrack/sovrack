/**
 * Shared stale-deployment threshold.
 *
 * A deployment stuck in RUNNING/PENDING beyond this limit is considered stale
 * (server crash, Ansible killed, network partition). Both the inline slot-
 * recovery in DeploymentsCreateService and the periodic cron in
 * DeploymentsStaleRecoveryService must use the SAME value — keeping it here
 * prevents the two from silently diverging.
 *
 * Value rationale: build timeout = 30 min → 45 min gives a 15-min margin
 * before declaring a legitimate long build as stale.
 */
export const STALE_THRESHOLD_MINUTES = 45;
