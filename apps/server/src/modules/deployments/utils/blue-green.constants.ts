/**
 * Shared blue-green port offset.
 *
 * The "green" (new) container publishes on `servicePort + this offset` so it
 * can run alongside the still-serving "blue" (old) container without a host
 * port collision. Both DockerDeployExecutorService (actual deploy) and
 * DeploymentPreflightService (pre-flight port-conflict check) must predict
 * the SAME published port — keeping it here prevents the two from silently
 * diverging.
 */
export const BLUE_GREEN_PORT_OFFSET = 1;
