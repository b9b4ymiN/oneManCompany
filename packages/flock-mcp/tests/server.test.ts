/**
 * Tests for MCP Server initialization and tool registration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FlockMCPServer, createFlockMCPServer } from '../src/server';
import type { FlockDatabase } from '@onemancompany/flock-kernel';

// Mock database
const mockDb = {
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  schema: {
    projects: {} as any,
    tasks: {} as any,
    agents: {} as any,
    runs: {} as any,
    reviews: {} as any,
    gates: {} as any,
    events: {} as any,
    task_dependencies: {} as any,
  },
  sqlite: {} as any,
} as unknown as FlockDatabase;

describe('FlockMCPServer', () => {
  let server: FlockMCPServer;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create server with default config', () => {
      server = new FlockMCPServer(mockDb);

      expect(server).toBeDefined();
      expect(server.getServer()).toBeDefined();
    });

    it('should create server with custom config', () => {
      server = new FlockMCPServer(mockDb, {
        name: 'custom-flock',
        version: '2.0.0',
        debug: true,
      });

      expect(server).toBeDefined();
    });
  });

  describe('createFlockMCPServer', () => {
    it('should create and configure server factory', async () => {
      server = await createFlockMCPServer(mockDb);

      expect(server).toBeDefined();
      expect(server.getServer()).toBeDefined();
    });

    it('should create server with custom config via factory', async () => {
      server = await createFlockMCPServer(mockDb, {
        name: 'test-flock',
        version: '1.0.0',
      });

      expect(server).toBeDefined();
    });
  });

  describe('registerTools', () => {
    it('should register all tools successfully', async () => {
      server = new FlockMCPServer(mockDb);
      await server.registerTools();

      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
    });

    it('should register tools via factory', async () => {
      server = await createFlockMCPServer(mockDb);

      const mcpServer = server.getServer();
      expect(mcpServer).toBeDefined();
    });
  });

  describe('connect and close', () => {
    it('should have connect method', async () => {
      server = new FlockMCPServer(mockDb);
      // Note: We can't actually connect in tests without stdio
      expect(typeof server.connect).toBe('function');
    });

    it('should have close method', async () => {
      server = new FlockMCPServer(mockDb);
      expect(typeof server.close).toBe('function');
    });
  });

  describe('getServer', () => {
    it('should return underlying MCP server instance', async () => {
      server = await createFlockMCPServer(mockDb);
      const mcpServer = server.getServer();

      expect(mcpServer).toBeDefined();
      expect(typeof mcpServer).toBe('object');
    });
  });
});
