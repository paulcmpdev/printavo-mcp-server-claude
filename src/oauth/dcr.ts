/**
 * Dynamic Client Registration (RFC 7591).
 *
 * Allows OAuth clients to auto-register with this server, avoiding manual
 * client_id/secret provisioning. Claude Desktop's Custom Connector UI uses
 * this when the user leaves the OAuth Client ID/Secret fields blank.
 */

import type { Router } from 'express';
import { z } from 'zod';
import { registerClient } from './store.js';

const RegistrationRequestSchema = z
  .object({
    client_name: z.string().min(1).optional(),
    redirect_uris: z.array(z.string().url()).min(1),
    token_endpoint_auth_method: z
      .enum(['none', 'client_secret_basic', 'client_secret_post'])
      .default('none'),
    grant_types: z.array(z.string()).default(['authorization_code', 'refresh_token']),
    response_types: z.array(z.string()).default(['code']),
    scope: z.string().optional(),
  })
  .passthrough(); // tolerate unknown fields from spec-compliant clients

export function registerDcrRoute(router: Router): void {
  router.post('/register', (req, res) => {
    const parsed = RegistrationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_client_metadata',
        error_description: parsed.error.issues.map((i) => i.message).join('; '),
      });
      return;
    }

    const input = parsed.data;
    const registered = registerClient({
      client_name: input.client_name,
      redirect_uris: input.redirect_uris,
      token_endpoint_auth_method: input.token_endpoint_auth_method,
      grant_types: input.grant_types,
      response_types: input.response_types,
    });

    // Only include a client_secret if the client chose a confidential auth method.
    const includeSecret =
      registered.token_endpoint_auth_method === 'client_secret_basic' ||
      registered.token_endpoint_auth_method === 'client_secret_post';
    if (includeSecret && !registered.client_secret) {
      // Confidential clients not supported in this minimal implementation;
      // return 400 rather than mint a secret we won't honor.
      res.status(400).json({
        error: 'unsupported_token_endpoint_auth_method',
        error_description:
          'This server only supports public clients (token_endpoint_auth_method=none) with PKCE.',
      });
      return;
    }

    res.status(201).json({
      client_id: registered.client_id,
      client_id_issued_at: Math.floor(registered.created_at / 1000),
      redirect_uris: registered.redirect_uris,
      token_endpoint_auth_method: registered.token_endpoint_auth_method,
      grant_types: registered.grant_types,
      response_types: registered.response_types,
      ...(registered.client_name ? { client_name: registered.client_name } : {}),
    });
  });
}
