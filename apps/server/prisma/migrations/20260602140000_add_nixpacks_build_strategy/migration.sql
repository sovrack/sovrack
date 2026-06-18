-- Add NIXPACKS value to BuildStrategy enum.
-- This enables Nixpacks-based auto-detection builds (like Coolify/Dokploy).
-- NIXPACKS is a Rust binary that detects the language/framework, generates
-- a Dockerfile + builds the image with a Nix-based cache for fast rebuilds.

ALTER TYPE "BuildStrategy" ADD VALUE IF NOT EXISTS 'NIXPACKS';
