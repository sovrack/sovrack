export type DnsProviderType = 'CLOUDFLARE' | 'DIGITALOCEAN' | 'OVH' | 'MANUAL';
export type DnsRecordType = 'A' | 'CNAME' | 'TXT';

export type DnsProvider = {
  id: string;
  name: string;
  type: DnsProviderType;
  apiToken: string | null;
  apiTokenConfigured: boolean;
  accountId: string | null;
  zoneId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Domain = {
  id: string;
  name: string;
  providerId: string | null;
  projectId: string | null;
  verified: boolean;
  records?: DnsRecord[];
  createdAt: string;
  updatedAt: string;
};

export type DnsRecord = {
  id: string;
  domainId: string;
  type: DnsRecordType;
  name: string;
  value: string;
  ttl: number;
  proxied: boolean | null;
  serviceId: string | null;
  environmentId: string | null;
  createdAt: string;
  updatedAt: string;
};
