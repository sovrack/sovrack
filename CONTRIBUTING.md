# Contributing to Sovrack 🚀

First off, thank you for considering contributing to Sovrack! It's people like you that make Sovrack a great tool for developers around the world.

## Code of Conduct

This project and everyone participating in it is governed by the [Sovrack Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to see if the problem has already been reported.

When creating a bug report, please include as much detail as possible:
* **Use a clear and descriptive title**
* **Describe the exact steps to reproduce the problem**
* **Provide your environment details** (OS, Docker version, Node version)
* **Include relevant logs**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues.
* Explain why this enhancement would be useful to most Sovrack users.
* List any alternative solutions or features you've considered.

### Pull Requests

1. **Fork the repo** and create your branch from `main`.
2. If you've added code that should be tested, **add tests**.
3. Ensure the test suite and quality gates pass:
   ```bash
   npm run lint
   npm run type-check
   npm run test
   ```
4. Issue that pull request!

## Local Development Setup

Prerequisites:
* Node.js >= 20.0.0
* Docker and Docker Compose v2

```bash
# Clone the repository
git clone https://github.com/sovrack/sovrack.git
cd sovrack

# Install dependencies across all workspaces
npm install

# Start development stack
npm run dev:server
npm run dev:web
```

Thank you for building with Sovrack!
