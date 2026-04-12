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

export interface NodeRedCredentials {
  url: string;
  authType: 'bearer' | 'basic';
  token?: string; // for bearer
  username?: string; // for basic
  password?: string; // for basic
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
  // Node-RED credentials captured at authorization time
  nodeRedCredentials?: NodeRedCredentials;
}

export interface AccessToken {
  token: string;
  clientId: string;
  userId: string;
  scopes: string[];
  expiresAt: number;
  // Node-RED credentials bound to this token
  nodeRedCredentials?: NodeRedCredentials;
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
