/**
 * Unit tests for LLM Provider Interceptors
 * Tests interceptor wrappers for OpenAI, Anthropic, Gemini, Ollama
 */

import { AxonFlow } from '../src/client';

// Mock the AxonFlow client
jest.mock('../src/client', () => ({
  AxonFlow: jest.fn().mockImplementation(() => ({
    protect: jest.fn().mockImplementation(fn => fn()),
    getPolicyApprovedContext: jest.fn().mockResolvedValue({
      approved: true,
      contextId: 'test-context',
    }),
    auditLLMCall: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

describe('LLM Provider Interceptors', () => {
  let mockAxonFlow: jest.Mocked<AxonFlow>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxonFlow = new AxonFlow({
      clientId: 'test-client',
      clientSecret: 'test-secret',
      tenant: 'test-tenant',
    }) as jest.Mocked<AxonFlow>;
  });

  describe('OpenAI Interceptor', () => {
    it('should have wrapOpenAIClient function exported', async () => {
      const { wrapOpenAIClient } = await import('../src/interceptors/openai');
      expect(wrapOpenAIClient).toBeDefined();
      expect(typeof wrapOpenAIClient).toBe('function');
    });

    it('should wrap a mock OpenAI client', async () => {
      const { wrapOpenAIClient } = await import('../src/interceptors/openai');

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              id: 'chatcmpl-123',
              choices: [{ message: { content: 'Hello!' } }],
            }),
          },
        },
      };

      const wrapped = wrapOpenAIClient(mockOpenAI, mockAxonFlow);
      expect(wrapped).toBeDefined();
      expect(wrapped.chat).toBeDefined();
    });

    it('should have OpenAIInterceptor class', async () => {
      const { OpenAIInterceptor } = await import('../src/interceptors/openai');
      expect(OpenAIInterceptor).toBeDefined();
    });

    it('should return openai as provider', async () => {
      const { OpenAIInterceptor } = await import('../src/interceptors/openai');
      const interceptor = new OpenAIInterceptor();
      expect(interceptor.getProvider()).toBe('openai');
    });

    it('should detect openai calls with canHandle', async () => {
      const { OpenAIInterceptor } = await import('../src/interceptors/openai');
      const interceptor = new OpenAIInterceptor();

      // Test with function that includes openai
      const openaiCall = () => 'openai.chat.completions.create';
      expect(interceptor.canHandle(openaiCall)).toBe(true);

      // Test with function that includes gpt
      const gptCall = () => 'using gpt-4 model';
      expect(interceptor.canHandle(gptCall)).toBe(true);

      // Test with unrelated function
      const otherCall = () => 'some random function';
      expect(interceptor.canHandle(otherCall)).toBe(false);
    });

    it('should extract gpt-4 model from request', async () => {
      const { OpenAIInterceptor } = await import('../src/interceptors/openai');
      const interceptor = new OpenAIInterceptor();

      const gpt4Call = () => 'call with gpt-4 model';
      const request = interceptor.extractRequest(gpt4Call);
      expect(request.provider).toBe('openai');
      expect(request.model).toBe('gpt-4');
    });

    it('should extract gpt-3.5 model from request', async () => {
      const { OpenAIInterceptor } = await import('../src/interceptors/openai');
      const interceptor = new OpenAIInterceptor();

      const gpt35Call = () => 'call with gpt-3.5 model';
      const request = interceptor.extractRequest(gpt35Call);
      expect(request.provider).toBe('openai');
      expect(request.model).toBe('gpt-3.5-turbo');
    });

    it('should return unknown model when not detected', async () => {
      const { OpenAIInterceptor } = await import('../src/interceptors/openai');
      const interceptor = new OpenAIInterceptor();

      const unknownCall = () => 'some openai call';
      const request = interceptor.extractRequest(unknownCall);
      expect(request.model).toBe('unknown');
    });

    it('should execute with modifications', async () => {
      const { OpenAIInterceptor } = await import('../src/interceptors/openai');
      const interceptor = new OpenAIInterceptor();

      const mockCall = jest.fn().mockResolvedValue('result');
      const result = await interceptor.executeWithModifications(mockCall, {});
      expect(result).toBe('result');
      expect(mockCall).toHaveBeenCalled();
    });

    it('should wrap nested objects recursively', async () => {
      const { wrapOpenAIClient } = await import('../src/interceptors/openai');

      const mockResponse = { id: 'test', choices: [{ message: { content: 'Hi' } }] };
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue(mockResponse),
          },
        },
        models: {
          list: jest.fn().mockResolvedValue({ data: [] }),
        },
      };

      const wrapped = wrapOpenAIClient(mockOpenAI, mockAxonFlow);
      expect(wrapped.chat.completions).toBeDefined();
      expect(wrapped.models).toBeDefined();
    });
  });

  describe('Anthropic Interceptor', () => {
    it('should have wrapAnthropicClient function exported', async () => {
      const { wrapAnthropicClient } = await import('../src/interceptors/anthropic');
      expect(wrapAnthropicClient).toBeDefined();
      expect(typeof wrapAnthropicClient).toBe('function');
    });

    it('should wrap a mock Anthropic client', async () => {
      const { wrapAnthropicClient } = await import('../src/interceptors/anthropic');

      const mockAnthropic = {
        messages: {
          create: jest.fn().mockResolvedValue({
            id: 'msg-123',
            content: [{ type: 'text', text: 'Hello!' }],
          }),
        },
      };

      const wrapped = wrapAnthropicClient(mockAnthropic, mockAxonFlow);
      expect(wrapped).toBeDefined();
      expect(wrapped.messages).toBeDefined();
    });

    it('should have AnthropicInterceptor class', async () => {
      const { AnthropicInterceptor } = await import('../src/interceptors/anthropic');
      expect(AnthropicInterceptor).toBeDefined();
    });

    it('should return anthropic as provider', async () => {
      const { AnthropicInterceptor } = await import('../src/interceptors/anthropic');
      const interceptor = new AnthropicInterceptor();
      expect(interceptor.getProvider()).toBe('anthropic');
    });

    it('should detect anthropic calls with canHandle', async () => {
      const { AnthropicInterceptor } = await import('../src/interceptors/anthropic');
      const interceptor = new AnthropicInterceptor();

      const anthropicCall = () => 'anthropic.messages.create';
      expect(interceptor.canHandle(anthropicCall)).toBe(true);

      const claudeCall = () => 'using claude model';
      expect(interceptor.canHandle(claudeCall)).toBe(true);

      const otherCall = () => 'random function';
      expect(interceptor.canHandle(otherCall)).toBe(false);
    });

    it('should extract claude-3 model from request', async () => {
      const { AnthropicInterceptor } = await import('../src/interceptors/anthropic');
      const interceptor = new AnthropicInterceptor();

      const claude3Call = () => 'call with claude-3 model';
      const request = interceptor.extractRequest(claude3Call);
      expect(request.provider).toBe('anthropic');
      expect(request.model).toBe('claude-3');
    });

    it('should extract claude-2 model from request', async () => {
      const { AnthropicInterceptor } = await import('../src/interceptors/anthropic');
      const interceptor = new AnthropicInterceptor();

      const claude2Call = () => 'call with claude-2 model';
      const request = interceptor.extractRequest(claude2Call);
      expect(request.model).toBe('claude-2');
    });

    it('should execute with modifications', async () => {
      const { AnthropicInterceptor } = await import('../src/interceptors/anthropic');
      const interceptor = new AnthropicInterceptor();

      const mockCall = jest.fn().mockResolvedValue('result');
      const result = await interceptor.executeWithModifications(mockCall, {});
      expect(result).toBe('result');
    });

    it('should intercept messages.create calls', async () => {
      const { wrapAnthropicClient } = await import('../src/interceptors/anthropic');

      const mockResponse = { id: 'msg-1', content: [{ type: 'text', text: 'Hi' }] };
      const mockCreate = jest.fn().mockResolvedValue(mockResponse);
      const mockAnthropic = {
        messages: {
          create: mockCreate,
          other: jest.fn(),
        },
        other_prop: 'value',
      };

      const wrapped = wrapAnthropicClient(mockAnthropic, mockAxonFlow);

      // Call the wrapped create method
      await wrapped.messages.create({ model: 'claude-3', max_tokens: 100, messages: [] });

      expect(mockAxonFlow.protect).toHaveBeenCalled();
    });
  });

  describe('Gemini Interceptor', () => {
    it('should have wrapGeminiModel function exported', async () => {
      const { wrapGeminiModel } = await import('../src/interceptors/gemini');
      expect(wrapGeminiModel).toBeDefined();
      expect(typeof wrapGeminiModel).toBe('function');
    });

    it('should wrap a mock Gemini model', async () => {
      const { wrapGeminiModel } = await import('../src/interceptors/gemini');

      const mockGemini = {
        generateContent: jest.fn().mockResolvedValue({
          response: { text: () => 'Hello!' },
        }),
        startChat: jest.fn().mockReturnValue({
          sendMessage: jest.fn().mockResolvedValue({
            response: { text: () => 'Hi!' },
          }),
        }),
      };

      const wrapped = wrapGeminiModel(mockGemini, mockAxonFlow);
      expect(wrapped).toBeDefined();
      expect(wrapped.generateContent).toBeDefined();
    });

    it('should have GeminiInterceptor class', async () => {
      const { GeminiInterceptor } = await import('../src/interceptors/gemini');
      expect(GeminiInterceptor).toBeDefined();
    });

    it('should return gemini as provider', async () => {
      const { GeminiInterceptor } = await import('../src/interceptors/gemini');
      const interceptor = new GeminiInterceptor();
      expect(interceptor.getProvider()).toBe('gemini');
    });

    it('should detect gemini calls with canHandle', async () => {
      const { GeminiInterceptor } = await import('../src/interceptors/gemini');
      const interceptor = new GeminiInterceptor();

      expect(interceptor.canHandle(() => 'gemini call')).toBe(true);
      expect(interceptor.canHandle(() => 'generateContent')).toBe(true);
      expect(interceptor.canHandle(() => 'google ai')).toBe(true);
      expect(interceptor.canHandle(() => 'palm model')).toBe(true);
      expect(interceptor.canHandle(() => 'random')).toBe(false);
    });

    it('should extract gemini models from request', async () => {
      const { GeminiInterceptor } = await import('../src/interceptors/gemini');
      const interceptor = new GeminiInterceptor();

      expect(interceptor.extractRequest(() => 'gemini-1.5-pro').model).toBe('gemini-1.5-pro');
      expect(interceptor.extractRequest(() => 'gemini-1.5-flash').model).toBe('gemini-1.5-flash');
      expect(interceptor.extractRequest(() => 'gemini-pro-vision').model).toBe('gemini-pro-vision');
      expect(interceptor.extractRequest(() => 'some gemini call').model).toBe('gemini-pro');
    });

    it('should execute with modifications', async () => {
      const { GeminiInterceptor } = await import('../src/interceptors/gemini');
      const interceptor = new GeminiInterceptor();

      const mockCall = jest.fn().mockResolvedValue('result');
      const result = await interceptor.executeWithModifications(mockCall, {});
      expect(result).toBe('result');
    });

    it('should wrap generateContent calls', async () => {
      const { wrapGeminiModel } = await import('../src/interceptors/gemini');

      const mockResponse = { response: { text: () => 'Hello' } };
      const mockGenerateContent = jest.fn().mockResolvedValue(mockResponse);
      const mockGemini = {
        generateContent: mockGenerateContent,
        otherMethod: jest.fn(),
      };

      const wrapped = wrapGeminiModel(mockGemini, mockAxonFlow);
      await wrapped.generateContent('Test prompt');

      expect(mockAxonFlow.protect).toHaveBeenCalled();
    });

    it('should wrap startChat and return wrapped chat', async () => {
      const { wrapGeminiModel } = await import('../src/interceptors/gemini');

      const mockSendMessage = jest.fn().mockResolvedValue({ response: { text: () => 'Hi' } });
      const mockChat = {
        sendMessage: mockSendMessage,
        getHistory: jest.fn(),
      };
      const mockStartChat = jest.fn().mockReturnValue(mockChat);
      const mockGemini = {
        generateContent: jest.fn(),
        startChat: mockStartChat,
      };

      const wrapped = wrapGeminiModel(mockGemini, mockAxonFlow);
      const chat = wrapped.startChat();

      expect(mockStartChat).toHaveBeenCalled();
      expect(chat).toBeDefined();
      expect(chat.sendMessage).toBeDefined();

      // Call sendMessage on the wrapped chat
      await chat.sendMessage('Hello');
      expect(mockAxonFlow.protect).toHaveBeenCalled();
    });
  });

  describe('Ollama Interceptor', () => {
    it('should have wrapOllamaClient function exported', async () => {
      const { wrapOllamaClient } = await import('../src/interceptors/ollama');
      expect(wrapOllamaClient).toBeDefined();
      expect(typeof wrapOllamaClient).toBe('function');
    });

    it('should wrap a mock Ollama client', async () => {
      const { wrapOllamaClient } = await import('../src/interceptors/ollama');

      const mockOllama = {
        chat: jest.fn().mockResolvedValue({
          message: { content: 'Hello!' },
        }),
        generate: jest.fn().mockResolvedValue({
          response: 'Generated text',
        }),
      };

      const wrapped = wrapOllamaClient(mockOllama, mockAxonFlow);
      expect(wrapped).toBeDefined();
      expect(wrapped.chat).toBeDefined();
      expect(wrapped.generate).toBeDefined();
    });

    it('should have OllamaInterceptor class', async () => {
      const { OllamaInterceptor } = await import('../src/interceptors/ollama');
      expect(OllamaInterceptor).toBeDefined();
    });

    it('should return ollama as provider', async () => {
      const { OllamaInterceptor } = await import('../src/interceptors/ollama');
      const interceptor = new OllamaInterceptor();
      expect(interceptor.getProvider()).toBe('ollama');
    });

    it('should detect ollama calls with canHandle', async () => {
      const { OllamaInterceptor } = await import('../src/interceptors/ollama');
      const interceptor = new OllamaInterceptor();

      expect(interceptor.canHandle(() => 'ollama call')).toBe(true);
      expect(interceptor.canHandle(() => 'llama model')).toBe(true);
      expect(interceptor.canHandle(() => 'mistral')).toBe(true);
      expect(interceptor.canHandle(() => 'codellama')).toBe(true);
      expect(interceptor.canHandle(() => 'localhost:11434')).toBe(true);
      expect(interceptor.canHandle(() => 'random')).toBe(false);
    });

    it('should extract ollama models from request', async () => {
      const { OllamaInterceptor } = await import('../src/interceptors/ollama');
      const interceptor = new OllamaInterceptor();

      expect(interceptor.extractRequest(() => 'mistral model').model).toBe('mistral');
      expect(interceptor.extractRequest(() => 'codellama').model).toBe('codellama');
      expect(interceptor.extractRequest(() => 'llama3').model).toBe('llama3');
      expect(interceptor.extractRequest(() => 'some call').model).toBe('llama2');
    });

    it('should execute with modifications', async () => {
      const { OllamaInterceptor } = await import('../src/interceptors/ollama');
      const interceptor = new OllamaInterceptor();

      const mockCall = jest.fn().mockResolvedValue('result');
      const result = await interceptor.executeWithModifications(mockCall, {});
      expect(result).toBe('result');
    });

    it('should wrap chat and generate calls', async () => {
      const { wrapOllamaClient } = await import('../src/interceptors/ollama');

      const mockChat = jest.fn().mockResolvedValue({ message: { content: 'Hi' } });
      const mockGenerate = jest.fn().mockResolvedValue({ response: 'Generated' });
      const mockOllama = {
        chat: mockChat,
        generate: mockGenerate,
        list: jest.fn(),
      };

      const wrapped = wrapOllamaClient(mockOllama, mockAxonFlow);

      await wrapped.chat({ model: 'llama2', messages: [] });
      expect(mockAxonFlow.protect).toHaveBeenCalled();

      jest.clearAllMocks();
      await wrapped.generate({ model: 'llama2', prompt: 'test' });
      expect(mockAxonFlow.protect).toHaveBeenCalled();
    });

    it('should have createGovernedOllamaChat function', async () => {
      const { createGovernedOllamaChat } = await import('../src/interceptors/ollama');
      expect(createGovernedOllamaChat).toBeDefined();
      expect(typeof createGovernedOllamaChat).toBe('function');
    });

    it('should create governed chat function', async () => {
      const { createGovernedOllamaChat } = await import('../src/interceptors/ollama');

      const mockResponse = {
        message: { content: 'Hello!' },
        prompt_eval_count: 10,
        eval_count: 20,
      };
      const mockOllama = {
        chat: jest.fn().mockResolvedValue(mockResponse),
      };

      const governedChat = createGovernedOllamaChat(mockOllama, mockAxonFlow, 'user-123');
      expect(governedChat).toBeDefined();
      expect(typeof governedChat).toBe('function');

      const result = await governedChat({
        model: 'llama2',
        messages: [{ role: 'user', content: 'Hello' }],
      });

      expect(result).toBe(mockResponse);
      expect(mockAxonFlow.getPolicyApprovedContext).toHaveBeenCalled();
      expect(mockAxonFlow.auditLLMCall).toHaveBeenCalled();
    });

    it('should block request when policy denies', async () => {
      const { createGovernedOllamaChat } = await import('../src/interceptors/ollama');

      const mockAxonFlowBlocking = new AxonFlow({
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tenant: 'test-tenant',
      }) as jest.Mocked<AxonFlow>;

      (mockAxonFlowBlocking.getPolicyApprovedContext as jest.Mock).mockResolvedValue({
        approved: false,
        blockReason: 'Policy violation',
      });

      const mockOllama = {
        chat: jest.fn(),
      };

      const governedChat = createGovernedOllamaChat(mockOllama, mockAxonFlowBlocking);

      await expect(
        governedChat({
          model: 'llama2',
          messages: [{ role: 'user', content: 'Bad request' }],
        })
      ).rejects.toThrow('Policy violation');
    });
  });

  describe('Interceptor Base Class', () => {
    it('should have BaseInterceptor exported', async () => {
      const { BaseInterceptor } = await import('../src/interceptors/base');
      expect(BaseInterceptor).toBeDefined();
    });
  });

  describe('Additional Branch Coverage Tests', () => {
    describe('OpenAI Interceptor Proxy Branches', () => {
      it('should not wrap non-API function properties', async () => {
        const { wrapOpenAIClient } = await import('../src/interceptors/openai');

        const mockOpenAI = {
          someProperty: 'value',
          otherFunction: jest.fn().mockReturnValue('result'),
        };

        const wrapped = wrapOpenAIClient(mockOpenAI, mockAxonFlow);

        // Non-API functions should be returned as-is
        expect(wrapped.someProperty).toBe('value');
        expect(wrapped.otherFunction()).toBe('result');
      });

      it('should wrap createCompletion and createEdit methods', async () => {
        const { wrapOpenAIClient } = await import('../src/interceptors/openai');

        const mockCreateCompletion = jest.fn().mockResolvedValue({ choices: [] });
        const mockCreateEdit = jest.fn().mockResolvedValue({ choices: [] });
        const mockOpenAI = {
          createCompletion: mockCreateCompletion,
          createEdit: mockCreateEdit,
        };

        const wrapped = wrapOpenAIClient(mockOpenAI, mockAxonFlow);

        await wrapped.createCompletion({ model: 'text-davinci-003', prompt: 'test' });
        expect(mockAxonFlow.protect).toHaveBeenCalled();

        jest.clearAllMocks();
        await wrapped.createEdit({ model: 'text-davinci-edit-001', input: 'test' });
        expect(mockAxonFlow.protect).toHaveBeenCalled();
      });

      it('should return null property as-is', async () => {
        const { wrapOpenAIClient } = await import('../src/interceptors/openai');

        const mockOpenAI = {
          nullProp: null,
        };

        const wrapped = wrapOpenAIClient(mockOpenAI, mockAxonFlow);
        expect(wrapped.nullProp).toBeNull();
      });
    });

    describe('Ollama Interceptor Proxy Branches', () => {
      it('should return non-function properties as-is', async () => {
        const { wrapOllamaClient } = await import('../src/interceptors/ollama');

        const mockOllama = {
          host: 'http://localhost:11434',
          version: '0.1.0',
          config: { timeout: 5000 },
        };

        const wrapped = wrapOllamaClient(mockOllama, mockAxonFlow);

        expect(wrapped.host).toBe('http://localhost:11434');
        expect(wrapped.version).toBe('0.1.0');
        expect(wrapped.config).toEqual({ timeout: 5000 });
      });

      it('should not wrap non-chat/generate methods', async () => {
        const { wrapOllamaClient } = await import('../src/interceptors/ollama');

        const mockList = jest.fn().mockResolvedValue([]);
        const mockShow = jest.fn().mockResolvedValue({});
        const mockOllama = {
          list: mockList,
          show: mockShow,
          chat: jest.fn(),
        };

        const wrapped = wrapOllamaClient(mockOllama, mockAxonFlow);

        await wrapped.list();
        expect(mockList).toHaveBeenCalled();
        expect(mockAxonFlow.protect).not.toHaveBeenCalled();

        await wrapped.show({ model: 'llama2' });
        expect(mockShow).toHaveBeenCalled();
      });
    });

    describe('createGovernedOllamaChat edge cases', () => {
      it('should handle response without message content', async () => {
        const { createGovernedOllamaChat } = await import('../src/interceptors/ollama');

        const mockResponse = {
          message: {},
          prompt_eval_count: undefined,
          eval_count: undefined,
        };
        const mockOllama = {
          chat: jest.fn().mockResolvedValue(mockResponse),
        };

        const governedChat = createGovernedOllamaChat(mockOllama, mockAxonFlow, 'user-123');
        const result = await governedChat({
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result).toBe(mockResponse);
        expect(mockAxonFlow.auditLLMCall).toHaveBeenCalledWith(
          expect.any(String),
          '',
          'ollama',
          'llama2',
          { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          expect.any(Number)
        );
      });

      it('should skip auditLLMCall when no contextId', async () => {
        const { createGovernedOllamaChat } = await import('../src/interceptors/ollama');

        const mockAxonFlowNoContext = new AxonFlow({
          clientId: 'test-client',
          clientSecret: 'test-secret',
          tenant: 'test-tenant',
        }) as jest.Mocked<AxonFlow>;

        (mockAxonFlowNoContext.getPolicyApprovedContext as jest.Mock).mockResolvedValue({
          approved: true,
          contextId: undefined,
        });

        const mockResponse = {
          message: { content: 'Hello!' },
        };
        const mockOllama = {
          chat: jest.fn().mockResolvedValue(mockResponse),
        };

        const governedChat = createGovernedOllamaChat(
          mockOllama,
          mockAxonFlowNoContext,
          'user-123'
        );
        const result = await governedChat({
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(result).toBe(mockResponse);
        expect(mockAxonFlowNoContext.auditLLMCall).not.toHaveBeenCalled();
      });

      it('should use default empty string for userToken', async () => {
        const { createGovernedOllamaChat } = await import('../src/interceptors/ollama');

        const mockResponse = {
          message: { content: 'Hello!' },
        };
        const mockOllama = {
          chat: jest.fn().mockResolvedValue(mockResponse),
        };

        // Create without userToken
        const governedChat = createGovernedOllamaChat(mockOllama, mockAxonFlow);
        await governedChat({
          model: 'llama2',
          messages: [{ role: 'user', content: 'Hello' }],
        });

        expect(mockAxonFlow.getPolicyApprovedContext).toHaveBeenCalledWith(
          expect.objectContaining({
            userToken: '',
          })
        );
      });
    });

    describe('OpenAI Interceptor canHandle branches', () => {
      it('should handle createCompletion call', async () => {
        const { OpenAIInterceptor } = await import('../src/interceptors/openai');
        const interceptor = new OpenAIInterceptor();

        expect(interceptor.canHandle(() => 'createCompletion test')).toBe(true);
      });

      it('should not handle unrelated call', async () => {
        const { OpenAIInterceptor } = await import('../src/interceptors/openai');
        const interceptor = new OpenAIInterceptor();

        expect(interceptor.canHandle(() => 'anthropic claude call')).toBe(false);
      });
    });

    describe('Anthropic Interceptor branches', () => {
      it('should handle claude-sonnet model', async () => {
        const { AnthropicInterceptor } = await import('../src/interceptors/anthropic');
        const interceptor = new AnthropicInterceptor();

        const request = interceptor.extractRequest(() => 'claude-sonnet message');
        expect(request.model).toBe('unknown');
      });
    });

    describe('Gemini Interceptor branches', () => {
      it('should handle different gemini models', async () => {
        const { GeminiInterceptor } = await import('../src/interceptors/gemini');
        const interceptor = new GeminiInterceptor();

        expect(interceptor.extractRequest(() => 'gemini-1.5-pro call').model).toBe(
          'gemini-1.5-pro'
        );
        expect(interceptor.extractRequest(() => 'gemini-1.5-flash call').model).toBe(
          'gemini-1.5-flash'
        );
        expect(interceptor.extractRequest(() => 'gemini-pro-vision call').model).toBe(
          'gemini-pro-vision'
        );
        expect(interceptor.extractRequest(() => 'gemini-pro call').model).toBe('gemini-pro');
        expect(interceptor.extractRequest(() => 'some call').model).toBe('gemini-pro');
      });

      it('should wrap startChat and return wrapped chat', async () => {
        const { wrapGeminiModel } = await import('../src/interceptors/gemini');

        const mockSendMessage = jest.fn().mockResolvedValue({
          response: { text: () => 'response' },
        });
        const mockChat = {
          sendMessage: mockSendMessage,
        };
        const mockStartChat = jest.fn().mockReturnValue(mockChat);
        const mockGemini = {
          startChat: mockStartChat,
        };

        const wrapped = wrapGeminiModel(mockGemini, mockAxonFlow);
        const chat = wrapped.startChat();

        expect(mockStartChat).toHaveBeenCalled();
        expect(chat.sendMessage).toBeDefined();

        await chat.sendMessage('Hello');
        expect(mockAxonFlow.protect).toHaveBeenCalled();
      });

      it('should return non-function properties as-is', async () => {
        const { wrapGeminiModel } = await import('../src/interceptors/gemini');

        const mockGemini = {
          apiVersion: '1.0',
          model: 'gemini-pro',
        };

        const wrapped = wrapGeminiModel(mockGemini, mockAxonFlow);
        expect(wrapped.apiVersion).toBe('1.0');
        expect(wrapped.model).toBe('gemini-pro');
      });
    });

    describe('Ollama Interceptor canHandle branches', () => {
      it('should handle localhost:11434 calls', async () => {
        const { OllamaInterceptor } = await import('../src/interceptors/ollama');
        const interceptor = new OllamaInterceptor();

        expect(interceptor.canHandle(() => 'localhost:11434 call')).toBe(true);
      });
    });
  });
});
