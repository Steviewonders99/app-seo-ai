import keywordPlannerService from '../services/keywordPlannerService.js';

/**
 * Generate keyword ideas based on a seed keyword
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const generateKeywordIdeas = async (req, res) => {
  try {
    const { keyword, language, locations, limit } = req.query;
    
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }

    // Parse locations if provided
    const parsedLocations = locations ? JSON.parse(locations) : [2840]; // Default to US
    const parsedLimit = limit ? parseInt(limit) : 50;
    
    const keywordIdeas = await keywordPlannerService.generateKeywordIdeas(
      keyword,
      language || 'en',
      parsedLocations,
      parsedLimit
    );
    
    res.status(200).json({
      success: true,
      data: {
        seedKeyword: keyword,
        keywordIdeas,
        count: keywordIdeas.length,
      },
    });
  } catch (error) {
    console.error('Error in generateKeywordIdeas controller:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate keyword ideas',
    });
  }
};

/**
 * Get keyword metrics for a list of keywords
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getKeywordMetrics = async (req, res) => {
  try {
    const { keywords, language, locations } = req.body;
    
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: 'Valid keywords array is required' });
    }

    // Parse locations if provided
    const parsedLocations = locations || [2840]; // Default to US
    
    const keywordMetrics = await keywordPlannerService.getKeywordMetrics(
      keywords,
      language || 'en',
      parsedLocations
    );
    
    res.status(200).json({
      success: true,
      data: {
        keywords,
        keywordMetrics,
        count: keywordMetrics.length,
      },
    });
  } catch (error) {
    console.error('Error in getKeywordMetrics controller:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get keyword metrics',
    });
  }
};

/**
 * Get historical metrics for keywords
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getHistoricalMetrics = async (req, res) => {
  try {
    const { keywords, language, locations } = req.body;
    
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return res.status(400).json({ error: 'Valid keywords array is required' });
    }

    // Parse locations if provided
    const parsedLocations = locations || [2840]; // Default to US
    
    const historicalMetrics = await keywordPlannerService.getHistoricalMetrics(
      keywords,
      language || 'en',
      parsedLocations
    );
    
    res.status(200).json({
      success: true,
      data: {
        keywords,
        historicalMetrics,
      },
    });
  } catch (error) {
    console.error('Error in getHistoricalMetrics controller:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get historical metrics',
    });
  }
};

export default {
  generateKeywordIdeas,
  getKeywordMetrics,
  getHistoricalMetrics,
};