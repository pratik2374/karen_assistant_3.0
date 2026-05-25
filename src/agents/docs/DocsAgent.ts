// @ts-nocheck
import { IAgent, AgentContext, AgentExecutionResult } from '../base/IAgent.js';
import { DocumentVaultMongoRepository, DocumentVaultEntry } from '../../infrastructure/persistence/mongo/repositories/DocumentVaultMongoRepository.js';
import { randomUUID } from 'crypto';
import { RuntimeEventBus } from '../../console/RuntimeEventBus.js';
import { OpenAI, OpenAIAgent } from '@llamaindex/openai';
import { FunctionTool } from 'llamaindex';
import * as dotenv from 'dotenv';
dotenv.config();

export class DocsAgent implements IAgent {
  readonly name = 'DocsAgent';
  readonly domain = 'System/Vault';
  readonly capabilities = ['document_storage', 'document_retrieval', 'secure_vault'];

  constructor(private vaultRepo: DocumentVaultMongoRepository) {}

  public async execute(context: AgentContext): Promise<AgentExecutionResult> {
    const start = Date.now();

    RuntimeEventBus.log('AGENT_STARTED', 'AI',
      `DocsAgent executing intent via LlamaIndex: ${context.intent}`,
      context.traceId
    );

    try {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is missing from environment variables');
      }

      // Define Tools with Zero-LLM Privacy (Links strictly stripped)
      
      const listTool = FunctionTool.from(
        async () => {
          RuntimeEventBus.log('DOCS_AGENT_TOOL', 'SYSTEM', 'Listing all vault documents (metadata only)', context.traceId);
          const docs = await this.vaultRepo.findAll();
          // Zero-LLM Privacy: Strip out raw link property
          return docs.map(d => ({
            docId: d.docId,
            name: d.name,
            aliases: d.aliases
          }));
        },
        {
          name: 'list_all_vault_documents',
          description: 'Get a list of all secure documents currently stored in the vault, with their document IDs, names, and aliases.',
          parameters: { type: 'object', properties: {} }
        }
      );

      const searchTool = FunctionTool.from(
        async (args: { query: string }) => {
          RuntimeEventBus.log('DOCS_AGENT_TOOL', 'SYSTEM', `Searching vault for: "${args.query}" (metadata only)`, context.traceId);
          let docs = await this.vaultRepo.findByAlias(args.query);
          
          // Fallback matching
          if (docs.length === 0) {
            const allDocs = await this.vaultRepo.findAll();
            const qLower = args.query.toLowerCase();
            docs = allDocs.filter(d => d.name.toLowerCase().includes(qLower) || qLower.includes(d.name.toLowerCase()));
          }
          // Zero-LLM Privacy: Strip out raw link property
          return docs.map(d => ({
            docId: d.docId,
            name: d.name,
            aliases: d.aliases
          }));
        },
        {
          name: 'search_vault_documents',
          description: 'Search for secure documents in the vault by name or alias. Returns metadata only.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'The document name, alias, or search term.' }
            },
            required: ['query']
          }
        }
      );

      const storeTool = FunctionTool.from(
        async (args: { name: string; urlPlaceholder: string; existingDocId?: string }) => {
          RuntimeEventBus.log('DOCS_AGENT_TOOL', 'SYSTEM', `Store/Update document: name="${args.name}", placeholder="${args.urlPlaceholder}", existingDocId="${args.existingDocId || ''}"`, context.traceId);
          
          // Unmask the URL
          const realUrl = (context as any).urlMasks?.[args.urlPlaceholder];
          if (!realUrl) {
            throw new Error(`Failed to store document. The URL placeholder "${args.urlPlaceholder}" was not found or is invalid.`);
          }

          // Programmatic Smart-Matching & Updating
          let matchedDoc: DocumentVaultEntry | null = null;

          if (args.existingDocId) {
            matchedDoc = await this.vaultRepo.findById(args.existingDocId);
          }

          if (!matchedDoc) {
            // Attempt automatic lookup by name or alias
            const allDocs = await this.vaultRepo.findAll();
            const targetNameLower = args.name.toLowerCase();
            matchedDoc = allDocs.find(d => 
              d.name.toLowerCase() === targetNameLower || 
              d.aliases.some(a => a.toLowerCase() === targetNameLower)
            ) || null;
          }

          if (matchedDoc) {
            // Smart update existing document link, preserving its docId and aliases!
            matchedDoc.link = realUrl;
            await this.vaultRepo.save(matchedDoc);
            RuntimeEventBus.log('DOCS_AGENT_TOOL', 'SYSTEM', `Smart updated existing document "${matchedDoc.name}" with new link.`, context.traceId);
            return {
              status: 'UPDATED',
              message: `Successfully updated the document "${matchedDoc.name}" with the new link.`,
              docId: matchedDoc.docId,
              name: matchedDoc.name
            };
          } else {
            // Store new document
            const newDoc: DocumentVaultEntry = {
              docId: randomUUID(),
              name: args.name,
              aliases: [args.name.toLowerCase()],
              link: realUrl
            };
            await this.vaultRepo.save(newDoc);
            RuntimeEventBus.log('DOCS_AGENT_TOOL', 'SYSTEM', `Stored new document "${args.name}" with ID: ${newDoc.docId}`, context.traceId);
            return {
              status: 'CREATED',
              message: `Successfully stored new document "${args.name}" securely.`,
              docId: newDoc.docId,
              name: args.name
            };
          }
        },
        {
          name: 'store_vault_document',
          description: 'Store a new document or update an existing document link. Use this tool whenever the user asks to save, upload, or update a document link.',
          parameters: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'The name of the document.' },
              urlPlaceholder: { type: 'string', description: 'The exact {{MASKED_URL_x}} placeholder representing the URL.' },
              existingDocId: { type: 'string', description: 'Optional. The exact docId of an existing document if updating a specific one.' }
            },
            required: ['name', 'urlPlaceholder']
          }
        }
      );

      const deleteTool = FunctionTool.from(
        async (args: { docId: string }) => {
          RuntimeEventBus.log('DOCS_AGENT_TOOL', 'SYSTEM', `Deleting document: ID="${args.docId}"`, context.traceId);
          const existing = await this.vaultRepo.findById(args.docId);
          if (!existing) {
            throw new Error(`No document found in vault with ID: "${args.docId}"`);
          }
          await this.vaultRepo.delete(args.docId);
          return {
            status: 'DELETED',
            message: `Successfully deleted document "${existing.name}" from the vault.`
          };
        },
        {
          name: 'delete_vault_document',
          description: 'Delete a document from the secure vault by its unique docId.',
          parameters: {
            type: 'object',
            properties: {
              docId: { type: 'string', description: 'The unique docId of the document to delete.' }
            },
            required: ['docId']
          }
        }
      );

      // Initialize LlamaIndex LLM & Agent
      const llm = new OpenAI({
        apiKey,
        model: 'gpt-5.4-mini',
        temperature: 0,
      });

      const agent = new OpenAIAgent({
        tools: [listTool, searchTool, storeTool, deleteTool],
        llm,
        verbose: true,
      });

      const userQuery = context.payload?.userQuery || context.payload?.query || context.intent || '';

      const query = `
You are the Karen Secure Document Vault Agent.
Your job is to manage the user's personal documents (such as Aadhar, PAN, Passports, etc.) in the secure vault.
You have access to tools to list all documents, search documents, store/update a document, and delete a document.

CRITICAL PRIVACY RULE:
- Document links are 100% hidden from you. The database tools will only return document metadata (ID, name, and aliases) and will never return the raw link.
- When retrieving or referring to a document, you MUST NEVER attempt to guess or output a raw URL link. Instead, you MUST output a secure placeholder in the exact format: {{VAULT_DOC:docId}} where "docId" is the exact ID of the document (e.g. {{VAULT_DOC:123-456}}).
- The outbound messaging pipeline will automatically intercept this placeholder and safely inject the actual URL.
- When saving or updating a document, the user's raw URL has been masked as a placeholder like {{MASKED_URL_1}}. You must pass this exact placeholder as the "urlPlaceholder" argument to the store_vault_document tool.

SMART UPDATE BEHAVIOR:
- If the user asks to save, upload, or update a document (e.g. "update my aadhar link to https://..."), first search or list the vault documents to check if a document with a matching name or alias (e.g., "Aadhar" or "aadhar") already exists.
- If an existing document matches, call the store_vault_document tool. You can pass the matched document's ID as the "existingDocId" parameter to update the existing entry. Alternatively, the tool itself can perform smart-matching based on the name.
- Be conversational and professional.

Original User Query: "${userQuery}"
`;

      const response = await agent.chat({
        message: query,
      });

      const summaryReport = response.toString();

      RuntimeEventBus.log('AGENT_COMPLETED', 'AI',
        `DocsAgent SUCCESS | ${Date.now() - start}ms | intent: ${context.intent}`,
        context.traceId
      );

      return {
        status: 'SUCCESS',
        data: {},
        summaryReport,
        mutationsCount: 1,
        latencyMs: Date.now() - start,
      };

    } catch (err: any) {
      RuntimeEventBus.log('AGENT_FAILED', 'ERROR',
        `DocsAgent failed: ${err.message}`,
        context.traceId
      );
      const safeErrorMessage = err.message.length > 1000 ? err.message.substring(0, 1000) + '... [truncated]' : err.message;
      return {
        status: 'FAILED',
        data: {},
        summaryReport: `Vault operation failed: ${safeErrorMessage}`,
        mutationsCount: 0,
        latencyMs: Date.now() - start,
        errorCode: 'AGENT_EXECUTION_ERROR',
      };
    }
  }
}
