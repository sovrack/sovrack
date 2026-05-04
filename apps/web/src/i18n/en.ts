export const en = {
  // Navigation
  nav: {
    operations: 'Operations',
    settings: 'Settings',
    dashboard: 'Dashboard',
    projects: 'Projects',
    builds: 'Builds',
    pipelines: 'Pipelines',
    deployments: 'Deployments',
    remoteServers: 'Remote Servers',
    terminal: 'Terminal',
    automation: 'Automation',
    monitoring: 'Monitoring',
    platformSettings: 'Platform Settings',
    sshKeys: 'SSH Keys',
    gitProviders: 'Git Providers',
    registry: 'Registry',
    auditLogs: 'Audit Logs',
    usersTeams: 'Users & Teams',
  },

  // Common actions
  actions: {
    refresh: 'Refresh',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    create: 'Create',
    add: 'Add',
    close: 'Close',
    retry: 'Retry',
    back: 'Back',
    confirm: 'Confirm',
    connect: 'Connect',
    disconnect: 'Disconnect',
    install: 'Install',
    test: 'Test connection',
    copy: 'Copy',
    copied: 'Copied',
    loading: 'Loading...',
    saving: 'Saving...',
  },

  // Server status
  serverStatus: {
    NEW: 'New',
    SSH_PENDING: 'SSH pending',
    SSH_VALIDATED: 'SSH validated',
    VALIDATION_FAILED: 'SSH validation failed',
    INFO_DETECTED: 'Info detected',
    PREPARATION_PENDING: 'Preparation pending',
    PREPARING: 'Preparing',
    PREPARED: 'Prepared',
    PARTIALLY_PREPARED: 'Partially prepared',
    PREPARATION_FAILED: 'Preparation failed',
    UNREACHABLE: 'Unreachable',
    DISABLED: 'Disabled',
  },

  // Preparation status
  preparationStatus: {
    QUEUED: 'Queued',
    RESOLVING_OPTIONS: 'Resolving options',
    WAITING_FOR_LOCK: 'Waiting for lock',
    RUNNING: 'Running',
    SUCCEEDED: 'Succeeded',
    PARTIAL: 'Partial',
    FAILED: 'Failed',
    TIMEOUT: 'Timeout',
    CANCELED: 'Canceled',
  },

  // Deployment status
  deploymentStatus: {
    PENDING: 'Pending',
    RUNNING: 'Running',
    SUCCESS: 'Success',
    FAILED: 'Failed',
    CANCELED: 'Canceled',
  },

  // Server actions
  server: {
    validateSsh: 'Validate SSH',
    revalidateSsh: 'Re-validate SSH',
    detectInfo: 'Detect Info',
    prepareServer: 'Prepare Server',
    reprepare: 'Re-prepare',
    viewLogs: 'View Logs',
    installKey: 'Install SSH Key',
  },

  // Common labels
  labels: {
    status: 'Status',
    name: 'Name',
    host: 'Host',
    port: 'Port',
    username: 'Username',
    environment: 'Environment',
    branch: 'Branch',
    created: 'Created',
    updated: 'Updated',
    startedAt: 'Started',
    finishedAt: 'Finished',
    duration: 'Duration',
    triggeredBy: 'Triggered by',
    noData: 'No data',
    total: 'Total',
    success: 'Success',
    failed: 'Failed',
    running: 'Running',
    health: 'Health',
    ready: 'Ready',
  },

  // Page titles
  pages: {
    dashboard: 'Dashboard',
    projects: 'Projects',
    builds: 'Builds',
    pipelines: 'Pipelines',
    deployments: 'Deployments',
    remoteServers: 'Remote Servers',
    terminal: 'Terminal SSH',
    automation: 'Automation',
    monitoring: 'Monitoring',
    settings: 'Platform Settings',
  },

  // Top-nav user dropdown
  userMenu: {
    settings: 'Settings',
    logout: 'Log out',
  },

  // Language switcher
  language: {
    label: 'Language',
    en: 'English',
    fr: 'Français',
  },

  // Empty states
  empty: {
    noServers: 'No servers configured.',
    noPipelines: 'No pipelines found.',
    noDeployments: 'No deployments yet.',
    noProjects: 'No projects yet.',
  },
};

export type I18nKey = typeof en;
