# Firewall Role

Security-first firewall configuration with UFW and Fail2Ban.

## 📋 What This Role Does

- ✅ Installs and configures UFW (Uncomplicated Firewall)
- ✅ Sets default deny incoming, allow outgoing
- ✅ Opens only essential ports (22, 80, 443)
- ✅ Implements SSH rate limiting (6 attempts/minute)
- ✅ Blocks database ports from public access (5432, 6379)
- ✅ Installs and configures Fail2Ban for intrusion prevention
- ✅ Protects SSH from brute force attacks
- ✅ Health checks and verification

## 🚀 Quick Start

```bash
# Run the role
ansible-playbook -i inventories/vps.yml site.yml --tags firewall

# Just install UFW
ansible-playbook -i inventories/vps.yml site.yml --tags firewall-install

# Just configure rules
ansible-playbook -i inventories/vps.yml site.yml --tags firewall-config

# Just setup Fail2Ban
ansible-playbook -i inventories/vps.yml site.yml --tags firewall-fail2ban
```

## 📁 Directory Structure

```
roles/firewall/
├── defaults/main.yml           # Default variables
├── tasks/
│   ├── main.yml               # Orchestrates all tasks
│   ├── install.yml            # Install UFW and Fail2Ban
│   ├── configure.yml          # Configure firewall rules
│   └── fail2ban.yml           # Configure Fail2Ban
├── templates/
│   └── fail2ban-sshd.conf.j2  # Fail2Ban SSH jail config
└── handlers/main.yml          # Service restart handlers
```

## 🔧 Configuration Variables

### Global (in defaults/main.yml)

```yaml
# UFW Settings
ufw_enabled: true
ufw_reset: false
ufw_logging: "medium"
ufw_logging_level: 3

# Default Policies (most important!)
ufw_default_input: "deny"        # Block everything incoming by default
ufw_default_output: "allow"      # Allow everything outgoing
ufw_default_forward: "deny"      # Block forwarding

# Allowed Ports (whitelist approach)
firewall_allowed_ports:
  - port: 22
    protocol: tcp
    name: SSH
    state: enabled
  - port: 80
    protocol: tcp
    name: HTTP
    state: enabled
  - port: 443
    protocol: tcp
    name: HTTPS
    state: enabled

# Fail2Ban Settings
fail2ban_enabled: true
fail2ban_ssh_enabled: true
fail2ban_ssh_max_retries: 5        # Lock after 5 failed attempts
fail2ban_ssh_find_time: 600        # Within 10 minutes
fail2ban_ssh_ban_time: 3600        # Ban for 1 hour
```

### Per-Environment (in group_vars/*/vars.yml)

**Production** (stricter):
```yaml
fail2ban_ssh_max_retries: 3        # Lock after 3 failed attempts
fail2ban_ssh_find_time: 600        # Within 10 minutes
fail2ban_ssh_ban_time: 7200        # Ban for 2 hours
```

**Staging** (more permissive):
```yaml
fail2ban_ssh_max_retries: 5        # Lock after 5 failed attempts
fail2ban_ssh_find_time: 600        # Within 10 minutes
fail2ban_ssh_ban_time: 1800        # Ban for 30 minutes
```

## ✅ Default Rules

### What's Allowed ✅
```
SSH (22/tcp)    - With rate limiting (6/min)
HTTP (80/tcp)   - Unrestricted
HTTPS (443/tcp) - Unrestricted
```

### What's Blocked 🔴
```
ALL other ports - By default policy
PostgreSQL (5432) - Explicitly blocked
Redis (6379)      - Explicitly blocked
Docker (2375)     - Implicitly blocked
```

## 🔐 Security Architecture

### UFW (Packet Filtering)
```
Incoming:   DENY by default  (whitelist approach)
Outgoing:   ALLOW by default (trust your system)
Forwarding: DENY by default  (not a router)
```

### Fail2Ban (Intrusion Prevention)
```
Monitors: SSH login attempts
Action:   Auto-ban on multiple failures
Duration: Configurable per environment
Notice:   Sends email notifications (if configured)
```

## ✅ Verification Commands

```bash
# Check UFW status
ansible all -i inventories/vps.yml -m shell -a "ufw status verbose"

# List all rules
ansible all -i inventories/vps.yml -m shell -a "ufw show added"

# Check Fail2Ban status
ansible all -i inventories/vps.yml -m shell -a "fail2ban-client status"

# Check SSH jail status
ansible all -i inventories/vps.yml -m shell -a "fail2ban-client status sshd"

# List banned IPs
ansible all -i inventories/vps.yml -m shell -a "fail2ban-client set sshd banip"

# Check port status
ansible all -i inventories/vps.yml -m shell -a "netstat -tlnp"

# Test connectivity
ansible all -i inventories/vps.yml -m shell -a "curl -I http://localhost"
ansible all -i inventories/vps.yml -m shell -a "curl -I https://localhost 2>/dev/null"
```

## 🚀 Common Tasks

### Allow a new port (e.g., 3000 for API)

Edit `inventories/group_vars/all.yml`:
```yaml
firewall_allowed_ports:
  - port: 22
    protocol: tcp
    name: SSH
    state: enabled
  - port: 80
    protocol: tcp
    name: HTTP
    state: enabled
  - port: 443
    protocol: tcp
    name: HTTPS
    state: enabled
  - port: 3000     # ← Add new port
    protocol: tcp
    name: API
    state: enabled
```

Then run:
```bash
ansible-playbook -i inventories/vps.yml site.yml --tags firewall-config
```

### Whitelist an IP (e.g., office network)

Edit the Fail2Ban config template or manually:
```bash
ansible all -i inventories/vps.yml -m shell -a \
  "fail2ban-client set sshd addignoreip 203.0.113.0/24"

# Persist it in ansible
# Edit: roles/firewall/templates/fail2ban-sshd.conf.j2
ignoreip = 127.0.0.1/8 ::1 203.0.113.0/24
```

### Temporarily disable Fail2Ban

```bash
ansible all -i inventories/vps.yml -m shell -a \
  "fail2ban-client set sshd bantime -1"  # Unban all
```

### Check who's been banned

```bash
ansible all -i inventories/vps.yml -m shell -a \
  "grep 'Ban' /var/log/fail2ban.log | tail -20"
```

### Manually unban an IP

```bash
ansible all -i inventories/vps.yml -m shell -a \
  "fail2ban-client set sshd unbanip 192.168.1.1"
```

## 🚨 Troubleshooting

### UFW not working
```bash
# Check if enabled
ansible all -i inventories/vps.yml -m shell -a "ufw status"

# Enable it
ansible all -i inventories/vps.yml -m shell -a "ufw enable"

# Check if running
ansible all -i inventories/vps.yml -m shell -a "systemctl status ufw"
```

### Can't SSH after enabling firewall
```bash
# SSH should still work (port 22 is allowed)
# If locked out, console access to add rule:
ansible all -i inventories/vps.yml -m shell -a \
  "ufw allow 22/tcp && ufw enable"

# Or disable and reapply role:
ansible-playbook -i inventories/vps.yml site.yml --tags firewall --extra-vars "ufw_reset=true"
```

### Fail2Ban not working
```bash
# Check if running
ansible all -i inventories/vps.yml -m shell -a "systemctl status fail2ban"

# Restart it
ansible all -i inventories/vps.yml -m shell -a "systemctl restart fail2ban"

# Check logs
ansible all -i inventories/vps.yml -m shell -a "tail -100 /var/log/fail2ban.log"

# Check jail configuration
ansible all -i inventories/vps.yml -m shell -a "cat /etc/fail2ban/jail.d/sshd.conf"
```

### IP banned incorrectly
```bash
# Unban an IP
ansible all -i inventories/vps.yml -m shell -a \
  "fail2ban-client set sshd unbanip 192.168.1.100"

# Add to ignoreip (permanently)
# Edit fail2ban config and rerun role
```

### Port blocked unexpectedly
```bash
# Check UFW rules
ansible all -i inventories/vps.yml -m shell -a "ufw show added"

# Temporarily allow port 3000
ansible all -i inventories/vps.yml -m shell -a "ufw allow 3000/tcp"

# Then add it properly to the role config
```

## 📊 Firewall Rules (Current)

```
To                         Action      From
--                         ------      ----
22/tcp                     LIMIT       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                    ALLOW       Anywhere
5432/tcp                   DENY        Anywhere
6379/tcp                   DENY        Anywhere
22/tcp (v6)                LIMIT       Anywhere (v6)
80/tcp (v6)                ALLOW       Anywhere (v6)
443/tcp (v6)               ALLOW       Anywhere (v6)
5432/tcp (v6)              DENY        Anywhere (v6)
6379/tcp (v6)              DENY        Anywhere (v6)

Default incoming:          DENY
Default outgoing:          ALLOW
Default forward:           DENY
```

## 🔄 Re-running the Role

Safe to run multiple times:
```bash
# Just reconfigure rules
ansible-playbook -i inventories/vps.yml site.yml --tags firewall-config

# Reapply all changes
ansible-playbook -i inventories/vps.yml site.yml --tags firewall

# Full reset (BE CAREFUL!)
ansible-playbook -i inventories/vps.yml site.yml --tags firewall --extra-vars "ufw_reset=true"
```

## ⚠️ Important Notes

1. **Default: Deny** - Whitelist approach (safer)
2. **SSH Rate Limit** - Prevents but allows legitimate connections
3. **Fail2Ban Email** - Configure to receive ban notifications
4. **IPv6**: Both IPv4 and IPv6 rules configured
5. **Logs**: Check `/var/log/ufw.log` and `/var/log/fail2ban.log`
6. **Test Before Production** - Don't lock yourself out!

## 📚 More Information

- [UFW Documentation](https://wiki.ubuntu.com/UncomplicatedFirewall)
- [Fail2Ban Documentation](https://www.fail2ban.org/wiki/index.php/Main_Page)
- [Linux Firewall Best Practices](https://www.digitalocean.com/community/tutorials/ufw-essentials-common-firewall-rules-and-commands)
- [OWASP Network Security](https://cheatsheetseries.owasp.org/cheatsheets/Network_Segmentation_Cheat_Sheet.html)

---

**Questions? Check the main IMPLEMENTATION_GUIDE.md for more details.**
