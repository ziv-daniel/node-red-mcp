/**
 * OAuth 2.0 types — RFC 6749 + PKCE (RFC 7636)
 */

export interface OAuthClient {
  clientId: string;
  clientSecret?: string; // absent for public clients
  redirectUris: string[];
  name: string;
  scopes: string[];
}

export interface AuthorizationCode {
  code: string;
  clientId: string;
  redirectUri: string;
  userId: string;
  scopes: string[];
  expiresAt: number;
  // PKCE
  codeChallenge: string;
  codeChallengeMethod: 'S256' | 'plain';
}

export interface AccessToken {
  token: string;
  clientId: string;
  userId: string;
  scopes: string[];
  expiresAt: number;
}

export interface OAuthAuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  token_endpoint_auth_methods_supported: string[];
  code_challenge_methods_supported: string[];
}
