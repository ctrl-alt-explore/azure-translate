// Add this near the top of your main file
const mockPPG = require('./mockPPGService')();

// Add this environment variable check
const USE_MOCK_PPG = process.env.USE_MOCK_PPG === 'true' || false;
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure multer for audio file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json());

// Azure Translator configuration
const AZURE_KEY = process.env.AZURE_TRANSLATOR_KEY;
const AZURE_ENDPOINT = process.env.AZURE_TRANSLATOR_ENDPOINT || 'https://api.cognitive.microsofttranslator.com';
const AZURE_REGION = process.env.AZURE_TRANSLATOR_REGION || 'global';

// Azure Speech configuration
const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY;
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION || 'eastus';

// PPG Service configuration (your teammates' Spring Boot service)
const PPG_SERVICE_URL = process.env.PPG_SERVICE_URL || 'http://localhost:8080';

// Azure Translator function
async function translateText(text, fromLang, toLang) {
  try {
    const response = await axios({
      baseURL: AZURE_ENDPOINT,
      url: '/translate',
      method: 'post',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_KEY,
        'Ocp-Apim-Subscription-Region': AZURE_REGION,
        'Content-type': 'application/json',
        'X-ClientTraceId': require('crypto').randomUUID()
      },
      params: {
        'api-version': '3.0',
        'from': fromLang,
        'to': toLang
      },
      data: [{
        'text': text
      }],
      responseType: 'json'
    });

    return response.data[0].translations[0].text;
  } catch (error) {
    console.error('Azure translation error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Azure Speech-to-Text function
async function speechToText(audioBuffer, language = 'zu-ZA') {
  try {
    const response = await axios({
      method: 'post',
      url: `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type': 'audio/wav',
        'Accept': 'application/json'
      },
      params: {
        'language': language,
        'format': 'detailed'
      },
      data: audioBuffer
    });

    return response.data.DisplayText || response.data.RecognitionStatus;
  } catch (error) {
    console.error('Speech-to-text error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Azure Text-to-Speech function
async function textToSpeech(text, language = 'zu-ZA', voice = 'zu-ZA-ThandoNeural') {
  try {
    const ssml = `
      <speak version='1.0' xml:lang='${language}'>
        <voice xml:lang='${language}' name='${voice}'>
          ${text}
        </voice>
      </speak>
    `;

    const response = await axios({
      method: 'post',
      url: `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
      },
      data: ssml,
      responseType: 'arraybuffer'
    });

    return response.data;
  } catch (error) {
    console.error('Text-to-speech error:', error.response ? error.response.data : error.message);
    throw error;
  }
}

// Enhanced health query processor with PPG integration
async function processHealthQuery(englishQuery, userId = 'demo-user') {
  const query = englishQuery.toLowerCase();
  
  try {
    // PPG measurement commands
    if (query.includes('heart rate') || query.includes('pulse') || query.includes('measure heart')) {
      console.log('🫀 Triggering heart rate measurement...');
      const response = await axios.post(`${PPG_SERVICE_URL}/api/ppg/heartrate`, {
        userId: userId,
        triggeredBy: 'voice'
      });
      
      if (response.data && response.data.heartRate) {
        return `Your heart rate is ${response.data.heartRate} beats per minute. This appears to be within normal range.`;
      } else {
        return 'Please place your finger on the camera to measure your heart rate.';
      }
    }
    
    if (query.includes('blood oxygen') || query.includes('oxygen') || query.includes('spo2')) {
      console.log('🩸 Triggering blood oxygen measurement...');
      const response = await axios.post(`${PPG_SERVICE_URL}/api/ppg/oxygen`, {
        userId: userId,
        triggeredBy: 'voice'
      });
      
      if (response.data && response.data.oxygenLevel) {
        return `Your blood oxygen level is ${response.data.oxygenLevel} percent. This is ${response.data.oxygenLevel >= 95 ? 'normal' : 'below normal range'}.`;
      } else {
        return 'Please place your finger on the camera to measure your blood oxygen level.';
      }
    }
    
    if (query.includes('trends') || query.includes('history') || query.includes('previous')) {
      console.log('📊 Fetching health trends...');
      const response = await axios.get(`${PPG_SERVICE_URL}/api/health/trends?userId=${userId}`);
      
      if (response.data && response.data.length > 0) {
        const latest = response.data[response.data.length - 1];
        return `Your recent average heart rate is ${latest.avgHeartRate} BPM. Your readings have been ${latest.trend || 'stable'} over the past week.`;
      } else {
        return 'No previous measurements found. Take your first measurement using the camera feature.';
      }
    }
    
    if (query.includes('start measurement') || query.includes('take measurement') || query.includes('measure now')) {
      return 'Please place your finger gently on the back camera and keep it still. The measurement will begin automatically.';
    }
    
    // Emergency and health advice queries
    if (query.includes('chest pain') || query.includes('heart attack') || query.includes('emergency')) {
      return 'If you are experiencing chest pain or think you may be having a heart attack, please call emergency services immediately. This app cannot replace emergency medical care.';
    }
    
    if (query.includes('medication') || query.includes('medicine') || query.includes('drugs')) {
      return 'Please consult with your healthcare provider before making any changes to your medication. I cannot provide medical advice about medications.';
    }
    
    if (query.includes('doctor') || query.includes('see doctor') || query.includes('medical help')) {
      return 'If you have health concerns, please schedule an appointment with your healthcare provider. This app provides monitoring tools but cannot replace professional medical advice.';
    }
    
    if (query.includes('help') || query.includes('what can you do') || query.includes('commands')) {
      return 'I can help you: measure heart rate, check blood oxygen levels, view your health trends, and provide basic health guidance. Try saying "measure my heart rate" or "show my trends".';
    }

    // Default response for unrecognized queries
    return 'I can help you monitor your health using your phone camera. Try asking me to measure your heart rate, check your blood oxygen, or show your health trends.';
    
  } catch (error) {
    console.error('Error calling PPG service:', error.message);
    // Fallback responses when PPG service is unavailable
    if (query.includes('heart rate') || query.includes('pulse')) {
      return 'Heart rate monitoring is temporarily unavailable. Please try again in a moment or use the camera feature directly.';
    }
    return 'Health monitoring services are temporarily unavailable. Please try again later.';
  }
}

// Language detection helper
function detectLanguage(text) {
  // Simple heuristic for isiZulu vs English
  const zuluWords = ['ngiyakwazi', 'sawubona', 'ngiyabonga', 'yini', 'kanjani', 'inhliziyo', 'umzimba'];
  const lowerText = text.toLowerCase();
  
  for (const word of zuluWords) {
    if (lowerText.includes(word)) {
      return 'zu';
    }
  }
  
  return 'en'; // Default to English
}

// Test endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'isiZulu Health Voice Assistant Backend is running with Azure Translator!',
    status: 'ready',
    translator: 'Azure Cognitive Services',
    speechServices: 'Azure Speech Services',
    ppgIntegration: 'Spring Boot PPG Service'
  });
});

// Health endpoint to test server
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    azure_configured: !!(AZURE_KEY && AZURE_ENDPOINT),
    speech_configured: !!(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION),
    ppg_service: PPG_SERVICE_URL
  });
});

// Translation endpoint (existing - keeping for testing)
app.post('/translate', async (req, res) => {
  try {
    const { text, sourceLang, targetLang } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }
    
    console.log(`🔄 Translating: "${text}" from ${sourceLang} to ${targetLang}`);
    
    const translation = await translateText(text, sourceLang, targetLang);
    
    console.log(`✅ Translation result: "${translation}"`);
    
    res.json({ 
      originalText: text,
      translatedText: translation,
      sourceLang,
      targetLang,
      service: 'Azure Translator'
    });
  } catch (error) {
    console.error('❌ Translation error:', error);
    res.status(500).json({ 
      error: 'Translation failed',
      details: error.message,
      suggestion: 'Check your Azure credentials and internet connection'
    });
  }
});

// Enhanced voice processing endpoint with audio support
app.post('/voice/process', upload.single('audio'), async (req, res) => {
  try {
    const { userLanguage = 'zu', userId = 'demo-user' } = req.body;
    let queryText = req.body.text; // For text input
    
    // If audio file is provided, convert to text first
    if (req.file) {
      console.log(`🎤 Processing audio file: ${req.file.originalname}`);
      try {
        queryText = await speechToText(req.file.buffer, userLanguage + '-ZA');
        console.log(`🔄 Speech-to-text result: "${queryText}"`);
      } catch (error) {
        console.error('Speech-to-text failed:', error);
        return res.status(500).json({ 
          error: 'Speech recognition failed',
          details: 'Could not convert audio to text'
        });
      }
    }
    
    if (!queryText) {
      return res.status(400).json({ error: 'Either audio file or text query is required' });
    }
    
    console.log(`🎤 Processing query: "${queryText}" in language: ${userLanguage}`);
    
    // Step 1: Translate to English if needed
    let englishQuery = queryText;
    if (userLanguage !== 'en') {
      try {
        englishQuery = await translateText(queryText, userLanguage, 'en');
        console.log(`🔄 Translated to English: "${englishQuery}"`);
      } catch (error) {
        console.error('Translation to English failed:', error);
        englishQuery = queryText; // Fallback
      }
    }
    
    // Step 2: Process the health query with PPG integration
    const englishResponse = await processHealthQuery(englishQuery, userId);
    console.log(`🏥 Health response: "${englishResponse}"`);
    
    // Step 3: Translate response back to original language
    let finalResponse = englishResponse;
    if (userLanguage !== 'en') {
      try {
        finalResponse = await translateText(englishResponse, 'en', userLanguage);
        console.log(`🔄 Translated back to ${userLanguage}: "${finalResponse}"`);
      } catch (error) {
        console.error('Translation back failed:', error);
        finalResponse = englishResponse; // Fallback
      }
    }
    
    // Step 4: Generate audio response
    let audioResponse = null;
    try {
      const audioBuffer = await textToSpeech(finalResponse, userLanguage + '-ZA');
      audioResponse = audioBuffer.toString('base64');
      console.log(`🔊 Generated audio response`);
    } catch (error) {
      console.error('Text-to-speech failed:', error);
      // Continue without audio - client can use text response
    }
    
    res.json({
      originalQuery: queryText,
      englishQuery: englishQuery,
      englishResponse: englishResponse,
      translatedResponse: finalResponse,
      audioResponse: audioResponse, // Base64 encoded audio
      language: userLanguage,
      timestamp: new Date().toISOString(),
      services: {
        translator: 'Azure Translator',
        speech: 'Azure Speech Services',
        ppg: 'Spring Boot PPG Service'
      }
    });
    
  } catch (error) {
    console.error('❌ Voice processing error:', error);
    res.status(500).json({ 
      error: 'Voice processing failed',
      details: error.message
    });
  }
});

// Health query processing endpoint (enhanced with PPG integration)
app.post('/process-health-query', async (req, res) => {
  try {
    const { query, userLanguage = 'zu', userId = 'demo-user' } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }
    
    console.log(`🎤 Received query: "${query}" in language: ${userLanguage}`);
    
    // Step 1: Translate isiZulu to English (if needed)
    let englishQuery = query;
    if (userLanguage !== 'en') {
      try {
        englishQuery = await translateText(query, userLanguage, 'en');
        console.log(`🔄 Translated to English: "${englishQuery}"`);
      } catch (error) {
        console.error('Translation to English failed:', error);
        englishQuery = query;
      }
    }
    
    // Step 2: Process the health query with PPG integration
    const englishResponse = await processHealthQuery(englishQuery, userId);
    console.log(`🏥 Health response: "${englishResponse}"`);
    
    // Step 3: Translate response back to isiZulu (if needed)
    let finalResponse = englishResponse;
    if (userLanguage !== 'en') {
      try {
        finalResponse = await translateText(englishResponse, 'en', userLanguage);
        console.log(`🔄 Translated back to isiZulu: "${finalResponse}"`);
      } catch (error) {
        console.error('Translation back to isiZulu failed:', error);
        finalResponse = englishResponse;
      }
    }
    
    res.json({
      originalQuery: query,
      englishQuery: englishQuery,
      englishResponse: englishResponse,
      translatedResponse: finalResponse,
      language: userLanguage,
      timestamp: new Date().toISOString(),
      service: 'Azure Translator + PPG Integration'
    });
    
  } catch (error) {
    console.error('❌ Processing error:', error);
    res.status(500).json({ 
      error: 'Query processing failed',
      details: error.message
    });
  }
});

// New endpoint: Direct PPG service proxy for voice-triggered measurements
app.post('/voice/trigger-measurement', async (req, res) => {
  try {
    const { measurementType, userId = 'demo-user', userLanguage = 'zu' } = req.body;
    
    console.log(`🎯 Voice-triggered measurement: ${measurementType} for user ${userId}`);
    
    let ppgEndpoint;
    let instruction;
    
    switch (measurementType) {
      case 'heartrate':
        ppgEndpoint = '/api/ppg/heartrate';
        instruction = 'Place your finger gently on the back camera and keep it still for 30 seconds.';
        break;
      case 'oxygen':
        ppgEndpoint = '/api/ppg/oxygen';
        instruction = 'Place your finger on the camera with the flashlight on. Keep very still for accurate readings.';
        break;
      default:
        ppgEndpoint = '/api/ppg/analyze';
        instruction = 'Place your finger on the camera to begin measurement.';
    }
    
    // Call PPG service
    const ppgResponse = await axios.post(`${PPG_SERVICE_URL}${ppgEndpoint}`, {
      userId: userId,
      triggeredBy: 'voice'
    });
    
    // Translate instruction to user's language
    let translatedInstruction = instruction;
    if (userLanguage !== 'en') {
      translatedInstruction = await translateText(instruction, 'en', userLanguage);
    }
    
    res.json({
      measurementId: ppgResponse.data.measurementId || 'voice-' + Date.now(),
      instruction: translatedInstruction,
      status: 'initiated',
      ppgServiceResponse: ppgResponse.data,
      language: userLanguage
    });
    
  } catch (error) {
    console.error('❌ PPG trigger error:', error);
    
    // Provide fallback instruction
    let fallbackInstruction = 'Measurement service is temporarily unavailable. Please use the camera feature directly.';
    if (req.body.userLanguage !== 'en') {
      try {
        fallbackInstruction = await translateText(fallbackInstruction, 'en', req.body.userLanguage);
      } catch (translateError) {
        console.error('Fallback translation failed:', translateError);
      }
    }
    
    res.status(500).json({ 
      error: 'Measurement trigger failed',
      instruction: fallbackInstruction,
      details: error.message
    });
  }
});

// Language support endpoint
app.get('/voice/languages', (req, res) => {
  res.json({
    supported: [
      { code: 'en', name: 'English', voice: 'en-US-AriaNeural' },
      { code: 'zu', name: 'isiZulu', voice: 'zu-ZA-ThandoNeural' }
    ],
    default: 'zu',
    speechRecognition: ['en-US', 'zu-ZA'],
    textToSpeech: ['en-US', 'zu-ZA']
  });
});

// Test PPG service connectivity
app.get('/test/ppg-connection', async (req, res) => {
  try {
    const response = await axios.get(`${PPG_SERVICE_URL}/health`, { timeout: 5000 });
    res.json({
      ppgService: 'connected',
      ppgServiceHealth: response.data,
      url: PPG_SERVICE_URL
    });
  } catch (error) {
    res.status(503).json({
      ppgService: 'disconnected',
      error: error.message,
      url: PPG_SERVICE_URL,
      suggestion: 'Make sure Spring Boot PPG service is running'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('🚀 isiZulu Health Voice Assistant Backend Started');
  console.log('🔗 Using Azure Translator + Speech Services');
  console.log('📝 Ready to handle isiZulu voice requests');
  console.log(`🔌 PPG Service URL: ${PPG_SERVICE_URL}`);
  
  // Check configuration
  if (!AZURE_KEY) {
    console.log('⚠️  WARNING: AZURE_TRANSLATOR_KEY not set in .env file');
  }
  if (!AZURE_SPEECH_KEY) {
    console.log('⚠️  WARNING: AZURE_SPEECH_KEY not set in .env file');
  }
  if (!PPG_SERVICE_URL) {
    console.log('⚠️  WARNING: PPG_SERVICE_URL not set in .env file');
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down gracefully...');
  process.exit(0);
});