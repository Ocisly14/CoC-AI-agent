#!/bin/bash

# Build script for CoC Multi-Agent System
# Runs the build process with proper validation

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🏗️  Building CoC Multi-Agent System${NC}"

# Run code quality checks first
echo -e "${BLUE}📝 Running code quality checks...${NC}"
pnpm check

# Run linting
echo -e "${BLUE}🔍 Running linter...${NC}"
pnpm lint

# Run type checking
echo -e "${BLUE}🔧 Running TypeScript compilation...${NC}"
pnpm build:tsc

# Run tests
if [ "$1" != "--skip-tests" ]; then
    echo -e "${BLUE}🧪 Running tests...${NC}"
    pnpm test
fi

# Run turbo build
echo -e "${BLUE}🚀 Running optimized build...${NC}"
pnpm build

echo -e "${GREEN}✅ Build completed successfully!${NC}"
echo -e "${GREEN}📁 Output available in dist/ directory${NC}"