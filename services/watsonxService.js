/**
 * IBM watsonx.ai Service
 * Core LLM integration for all agents using IBM watsonx.ai API
 */

const axios = require('axios');
require('dotenv').config();

class WatsonxService {
  constructor() {
    this.apiKey = process.env.WATSONX_API_KEY;
    this.projectId = process.env.WATSONX_PROJECT_ID;
    this.baseUrl = process.env.WATSONX_URL || 'https://us-south.ml.cloud.ibm.com';
    this.modelId = process.env.WATSONX_MODEL_ID || 'ibm/granite-13b-instruct-v2';
    this.iamToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Obtain IAM Bearer token from IBM Cloud
   */
  async getIAMToken() {
    const now = Date.now();
    if (this.iamToken && this.tokenExpiry && now < this.tokenExpiry) {
      return this.iamToken;
    }

    try {
      const response = await axios.post(
        'https://iam.cloud.ibm.com/identity/token',
        new URLSearchParams({
          grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
          apikey: this.apiKey
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      );

      this.iamToken = response.data.access_token;
      // Expire 5 minutes before actual expiry for safety
      this.tokenExpiry = now + (response.data.expires_in - 300) * 1000;
      return this.iamToken;
    } catch (error) {
      throw new Error(`IBM IAM Token Error: ${error.message}`);
    }
  }

  /**
   * Generate text using IBM watsonx.ai Granite model
   * @param {string} prompt - The prompt to send to the model
   * @param {object} options - Generation parameters
   * @returns {Promise<string>} - Generated text response
   */
  async generateText(prompt, options = {}) {
    const token = await this.getIAMToken();

    const payload = {
      model_id: options.modelId || this.modelId,
      input: prompt,
      parameters: {
        decoding_method: options.decoding_method || 'greedy',
        max_new_tokens: options.max_new_tokens || parseInt(process.env.AGENT_MAX_TOKENS) || 1024,
        min_new_tokens: options.min_new_tokens || 50,
        temperature: options.temperature || parseFloat(process.env.AGENT_TEMPERATURE) || 0.3,
        top_k: options.top_k || 50,
        top_p: options.top_p || 0.95,
        repetition_penalty: options.repetition_penalty || 1.1,
        stop_sequences: options.stop_sequences || []
      },
      project_id: this.projectId
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/ml/v1/text/generation?version=2024-03-14`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          timeout: 60000
        }
      );

      const result = response.data.results?.[0]?.generated_text || '';
      return result.trim();
    } catch (error) {
      if (error.response?.status === 401) {
        // Token may have expired, force refresh
        this.iamToken = null;
        throw new Error('Authentication failed. Check your IBM watsonx.ai API key.');
      }
      throw new Error(`watsonx.ai Generation Error: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Stream text generation for real-time responses
   * @param {string} prompt - The prompt
   * @param {function} onChunk - Callback for each streamed chunk
   */
  async streamText(prompt, onChunk, options = {}) {
    const token = await this.getIAMToken();

    const payload = {
      model_id: options.modelId || this.modelId,
      input: prompt,
      parameters: {
        decoding_method: 'greedy',
        max_new_tokens: options.max_new_tokens || 1024,
        temperature: options.temperature || 0.3
      },
      project_id: this.projectId
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/ml/v1/text/generation_stream?version=2024-03-14`,
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream'
          },
          responseType: 'stream',
          timeout: 120000
        }
      );

      response.data.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const text = data.results?.[0]?.generated_text || '';
              if (text) onChunk(text);
            } catch (e) {
              // Ignore parse errors on partial chunks
            }
          }
        }
      });

      return new Promise((resolve, reject) => {
        response.data.on('end', resolve);
        response.data.on('error', reject);
      });
    } catch (error) {
      throw new Error(`watsonx.ai Stream Error: ${error.message}`);
    }
  }

  /**
   * Check service health / connectivity
   */
  async healthCheck() {
    try {
      await this.getIAMToken();
      return { status: 'connected', model: this.modelId, url: this.baseUrl };
    } catch (error) {
      return { status: 'error', message: error.message };
    }
  }
}

module.exports = new WatsonxService();
