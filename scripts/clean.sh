#!/bin/bash

# Clean script for CoC Multi-Agent System
# Removes build artifacts and cache files

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧹 Cleaning CoC Multi-Agent System${NC}"

# Remove dist directory
if [ -d "dist" ]; then
    echo -e "${YELLOW}🗑️  Removing dist/ directory...${NC}"
    rm -rf dist
fi

# Remove node_modules cache
if [ -d "node_modules/.cache" ]; then
    echo -e "${YELLOW}🗑️  Removing node_modules/.cache...${NC}"
    rm -rf node_modules/.cache
fi

# Remove coverage directory
if [ -d "coverage" ]; then
    echo -e "${YELLOW}🗑️  Removing coverage/ directory...${NC}"
    rm -rf coverage
fi

# Remove .turbo cache
if [ -d ".turbo" ]; then
    echo -e "${YELLOW}🗑️  Removing .turbo/ cache...${NC}"
    rm -rf .turbo
fi

# Clean pnpm cache
echo -e "${YELLOW}🗑️  Cleaning pnpm cache...${NC}"
pnpm store prune || true

echo -e "${GREEN}✅ Clean completed successfully!${NC}"