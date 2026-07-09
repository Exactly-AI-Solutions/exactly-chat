# Exactly Chat API

## Overview

What this is: A production-grade, multi-tenant AI chat API built on Next.js and deployed to Vercel. It serves white-label chatbot agents to clients, each grounded in their own knowledge base. Handles auth, RAG retrieval, streaming responses, rate limiting, request logging, and observability. This is the system being built.

## Chat Functionality

Each client will get its own Chat Agent to handle the chats on their website. Each chatbot can do the following:
- Answer basic questions about the company, using the provided knowledge base and a document of canonical pairs and conversation samples as
  reference for how to answer questions correctly with the proper voice.

Each chatbot has its own prompt and supplemental documents (knowledge base, QA samples, guidelines) that the chat agent will need to reference and model its responses after.

## Tech Stack

We will be using Anthropic models (Sonnet 4.6 preferred for testing/prototyping)

We will be deploying to Vercel and Supabase.

Core Framework
Next.js (App Router) — The framework the entire Exactly Chat API is built on. Chosen because it deploys to Vercel natively with zero configuration, the Vercel AI SDK is designed around its Route Handlers, and it gives you a production-grade API server without needing Express or a separate backend framework. App Router specifically is used because Route Handlers (the modern replacement for Pages API routes) have first-class support for streaming responses, which is required for the chat stream.

AI & Chat
Vercel AI SDK (ai, @ai-sdk/anthropic) — The core library for interacting with AI models. Used for two things: streamText on the API side to generate and stream responses, and embed to convert user messages into vectors for similarity search. Also provides the useChat hook on the mirror site side. Chosen because it abstracts over different model providers (so switching from OpenAI to Anthropic is a one-line change), handles streaming natively with Next.js, and has built-in Langfuse telemetry support.

Database & Vector Store
Supabase (@supabase/supabase-js) — Used for three things in one place: the vector store (via pgvector) for the knowledge base, the relational tables for clients/keys/logs, and the RPC function for similarity search. Chosen because it's already the team's database of choice, it supports pgvector natively, and consolidating everything into one Supabase project avoids managing a separate vector database service.

Authentication
bcryptjs — Used to hash API keys before storing them in Supabase, and to compare an incoming plaintext key against stored hashes during validation. Chosen over the native crypto module because bcrypt's slow hashing algorithm makes brute-force attacks against the stored hashes computationally expensive.

Rate Limiting
Upstash Redis (@upstash/redis, @upstash/ratelimit) — Used to enforce per-client request limits (20 requests per minute per client). Upstash specifically is chosen over a generic Redis provider because it's serverless-native — standard Redis requires a persistent connection, which doesn't work in Vercel's serverless/edge environment. Upstash uses an HTTP-based API that works perfectly in that context and has a free tier.

Observability
Langfuse (langfuse-vercel) — Used for tracing every chat request end-to-end. Each trace shows the full prompt, retrieved KB chunks, model response, token usage, latency, and client metadata. Chosen for its first-class Vercel AI SDK integration (wires up via experimental_telemetry with minimal code), its hosted free tier which is enough for this stage, and its prompt management feature which lets you tweak system prompts without a code deploy.
@vercel/otel — The OpenTelemetry instrumentation layer that Langfuse plugs into. Required to register the Langfuse exporter at the application level so it intercepts all AI SDK traces automatically. This is boilerplate plumbing rather than a deliberate choice — it's just how the Langfuse/Vercel AI SDK integration works.

Knowledge Base Ingestion (local script only)
pdf-parse — Used in the ingestion script to extract raw text from PDF files page by page before chunking. Lightweight, no external dependencies, sufficient for the KB ingestion use case.
dotenv — Loads .env variables in the ingestion script (a plain Node.js script, not a Next.js app, so it doesn't get .env handling automatically).

## Authentication

Handle w/ Bearer token and domain whitelisting (i.e. the api should only accept requests from someone on the whitelisted domain and the api key)

## Observability

Langfuse is used to trace and log.
