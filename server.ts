/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type, Schema } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

// Lazy initialization for Google GenAI
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY environment variable is not set. AI extraction will use deterministic fallback.');
    return null;
  }
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({ apiKey });
  }
  return genAIClient;
}

// Extraction Response JSON Schema definition
const EXTRACTION_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    responseMode: {
      type: Type.STRING,
      enum: ['TRANSACTION', 'CONVERSATION'],
      description: 'TRANSACTION for a new or updated order candidate; CONVERSATION for a factual follow-up about prior context.'
    },
    buyerName: { type: Type.STRING, description: 'Name, customer identifier, or reference code of the buyer ordering (e.g. "TEST-ISOLATION-A", "Rina Handayani")' },
    buyerPhone: { type: Type.STRING, description: 'Phone or WhatsApp number of buyer' },
    payerName: { type: Type.STRING, description: 'Name on the bank account or person paying' },
    payerBank: { type: Type.STRING, description: 'Bank used for transfer e.g. BCA, Mandiri, BRI' },
    payerAccount: { type: Type.STRING, description: 'Bank account number if mentioned' },
    isPayerDifferentFromBuyer: { type: Type.BOOLEAN, description: 'True if payer is husband/friend/family different from buyer' },
    recipientName: { type: Type.STRING, description: 'Name of the person receiving the delivery package' },
    recipientPhone: { type: Type.STRING, description: 'Contact phone of recipient' },
    recipientAddress: { type: Type.STRING, description: 'Complete shipping address including street, number, RT/RW, subdistrict' },
    recipientCity: { type: Type.STRING, description: 'Destination city or regency' },
    isRecipientDifferentFromBuyer: { type: Type.BOOLEAN, description: 'True if delivery goes to a 3rd party/gift receiver' },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          matchedSku: { type: Type.STRING, description: 'Matching product SKU from catalog if recognized' },
          rawText: { type: Type.STRING, description: 'The exact raw phrase used in the message (e.g. "2 Medium coffee")' },
          productName: { type: Type.STRING, description: 'Standard or extracted product name (e.g. "Medium coffee")' },
          quantity: { type: Type.INTEGER, description: 'Quantity count ordered' },
          suggestedUnitPrice: { type: Type.NUMBER, description: 'Unit price in IDR if mentioned or derived from total payment' },
          suggestedUnitCost: { type: Type.NUMBER, description: 'Unit modal cost in IDR' },
        },
        required: ['rawText', 'productName', 'quantity'],
      },
    },
    paymentMethod: { 
      type: Type.STRING, 
      enum: ['TRANSFER', 'COD', 'DIRECT_COD', 'QRIS', 'CASH'],
      description: 'Payment method chosen or claimed'
    },
    claimedPaymentAmount: { type: Type.NUMBER, description: 'Explicit payment amount in IDR mentioned in chat (e.g. 30000)' },
    paymentProofClaimed: { type: Type.BOOLEAN, description: 'True if user says they already transferred or attached receipt' },
    transferReference: { type: Type.STRING, description: 'Transfer transaction ID / ref number' },
    courierName: { type: Type.STRING, description: 'Requested courier e.g. J&T Express, JNE, SiCepat, GoSend, Direct / Pickup' },
    quotedOngkir: { type: Type.NUMBER, description: 'Estimated courier shipping fee in IDR (0 if not specified)' },
    buyerOngkir: { type: Type.NUMBER, description: 'Shipping fee charged to buyer in IDR (0 if not specified)' },
    sellerAbsorbedOngkir: { type: Type.NUMBER, description: 'Shipping fee absorbed by reseller in IDR' },
    customerNotes: { type: Type.STRING, description: 'Special delivery or packaging notes' },
    confidence: { type: Type.NUMBER, description: 'Confidence score from 0.0 to 1.0' },
    ambiguities: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: 'List of specific ambiguous or missing items (e.g. missing street number, unclear variant, unknown payer name)'
    },
    explanation: { 
      type: Type.STRING, 
      description: 'Friendly, clear conversational response from Si Gembul the cat mascot in conversational English/Indonesian explaining what was extracted and if anything is needed.' 
    },
  },
  required: ['responseMode', 'items', 'confidence', 'explanation', 'ambiguities'],
};

function isConversationalQuestion(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return /\?|\b(what|how|which|when|where|why|berapa|berapa banyak|jumlah|kuantitas|quantity|profit|laba|margin|sales|cogs|equivalent|setara)\b/.test(normalized);
}

function getLatestTransactionCandidate(conversationHistory: any[]): any | undefined {
  return [...conversationHistory].reverse().find(turn =>
    turn.role === 'assistant' && Array.isArray(turn.candidate?.items) && turn.candidate.items.length > 0
  )?.candidate;
}

function buildStructuredTransactionContext(candidate: any, catalog: any[] = []) {
  const parsedItems = (candidate.items || []).map((item: any) => {
    const quantity = Math.max(1, Number(item.quantity) || 1);
    const catalogProduct = catalog.find(product => product.sku === item.matchedSku);
    const pieceEquivalent = Math.max(1, Number(catalogProduct?.pieceEquivalent) || (item.matchedSku?.endsWith('-1KG') ? 4 : 1));
    const isWeightBased = pieceEquivalent > 1 || item.matchedSku?.endsWith('-1KG');

    return {
      catalogProduct,
      sku: item.matchedSku,
      productName: item.productName,
      rawText: item.rawText,
      originalQuantity: quantity,
      originalUnit: isWeightBased ? 'kg' : 'pcs',
      pieceEquivalent,
      normalizedPieces: quantity * pieceEquivalent,
    };
  });
  const isBulkEligible = parsedItems.reduce((total: number, item: any) => total + item.normalizedPieces, 0) >= 20;
  const items = parsedItems.map((item: any, index: number) => {
    const sourceItem = candidate.items[index];
    const suggestedUnitPrice = Math.max(0, Number(sourceItem.suggestedUnitPrice) || 0);
    let unitPrice = item.catalogProduct?.sellPrice ?? suggestedUnitPrice;
    if (isBulkEligible && item.catalogProduct?.bulkPrice) {
      unitPrice = item.catalogProduct.bulkPrice;
    }
    if (suggestedUnitPrice > 0 && suggestedUnitPrice !== item.catalogProduct?.sellPrice && suggestedUnitPrice !== item.catalogProduct?.bulkPrice) {
      unitPrice = suggestedUnitPrice;
    }
    const unitCost = item.catalogProduct?.baseCost ?? Math.max(0, Number(sourceItem.suggestedUnitCost) || 0);
    const { catalogProduct, ...contextItem } = item;
    return {
      ...contextItem,
      unitPrice,
      unitCost,
      sales: item.originalQuantity * unitPrice,
      cogs: item.originalQuantity * unitCost,
    };
  });
  const sales = items.reduce((total: number, item: any) => total + item.sales, 0);
  const cogs = items.reduce((total: number, item: any) => total + item.cogs, 0);
  const profit = sales - cogs;

  return {
    items,
    financials: {
      sales,
      cogs,
      profit,
      marginPercent: sales > 0 ? Math.round((profit / sales) * 1000) / 10 : 0,
    },
  };
}

function isContextualUpdate(message: string, conversationHistory: any[]): boolean {
  return !!getLatestTransactionCandidate(conversationHistory) &&
    /\b(change|update|revise|modify|ubah|ganti|sekarang|now)\b/i.test(message);
}

function retainTransactionContext(updatedCandidate: any, previousCandidate: any): any {
  return {
    ...updatedCandidate,
    buyerName: previousCandidate.buyerName,
    buyerPhone: previousCandidate.buyerPhone,
    payerName: previousCandidate.payerName,
    payerBank: previousCandidate.payerBank,
    payerAccount: previousCandidate.payerAccount,
    recipientName: previousCandidate.recipientName,
    recipientPhone: previousCandidate.recipientPhone,
    recipientAddress: previousCandidate.recipientAddress,
    recipientCity: previousCandidate.recipientCity,
    paymentMethod: previousCandidate.paymentMethod,
    courierName: previousCandidate.courierName,
    quotedOngkir: previousCandidate.quotedOngkir,
    buyerOngkir: previousCandidate.buyerOngkir,
    sellerAbsorbedOngkir: previousCandidate.sellerAbsorbedOngkir,
  };
}

function buildFallbackConversationReply(message: string, conversationHistory: any[], catalog: any[] = []) {
  const latestCandidate = getLatestTransactionCandidate(conversationHistory);
  if (!latestCandidate) {
    return {
      responseMode: 'CONVERSATION',
      explanation: 'I need a previous transaction in this chat before I can answer that follow-up.',
    };
  }

  const context = buildStructuredTransactionContext(latestCandidate, catalog);
  const itemSummary = context.items.map((item: any) => {
    return `${item.originalQuantity} ${item.originalUnit} ${item.productName} (${item.normalizedPieces} pcs equivalent)`;
  }).join(', ');

  return {
    responseMode: 'CONVERSATION',
    explanation: `The most recent transaction was ${itemSummary}. Sales: Rp ${context.financials.sales.toLocaleString('id-ID')}; COGS: Rp ${context.financials.cogs.toLocaleString('id-ID')}; Profit: Rp ${context.financials.profit.toLocaleString('id-ID')} (Margin: ${context.financials.marginPercent}%).`,
  };
}

// Health Check API
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    appName: 'Si Gembul Reseller Guard',
    geminiConfigured: !!process.env.GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// Gemini Multi-turn Agent Interpret Endpoint
app.post('/api/agent/interpret', async (req: Request, res: Response) => {
  try {
    const { 
      message, 
      conversationHistory = [], 
      catalog = [], 
      storeSettings = {}, 
      imageBase64 = null,
      imageMimeType = 'image/jpeg' 
    } = req.body;

    if (!message && !imageBase64) {
      res.status(400).json({ error: 'Message or image evidence is required.' });
      return;
    }

    const ai = getGenAI();

    // Prepare catalog context
    const catalogSummary = catalog.map((p: any) => 
      `- SKU: ${p.sku} | Name: "${p.name}" | Sell Price: Rp ${p.sellPrice} | Base Cost: Rp ${p.baseCost}`
    ).join('\n');

    const systemPrompt = `You are "Si Gembul", the intelligent and vigilant AI Operations & Financial Control Mascot (a chubby gray-and-white cat) for Indonesian micro-resellers.

Your mission:
1. Interpret both free-form reseller chats and explicit labeled transaction prompts (e.g. "Customer/reference: ... Order: ... Payment: ...", whether on multiple lines or space-separated single-line).
2. Segment explicit field markers accurately even when newlines are missing or whitespace is collapsed:
   - "Customer/reference:", "Buyer:", "Pelanggan:", "a.n:" -> extract as customer/buyer/reference name. Verbatim preserve explicit codes (e.g. "TEST-FINANCE-A", "TEST-ISOLATION-A", "CUST-01").
   - "Order:", "Pesanan:", "Item:", "Produk:" -> extract ordered items with their explicit quantities and product names.
   - "Payment:", "Pembayaran:", "Bayar:" -> extract payment amount and method.
3. Handle product catalog matching and normalization:
   - Match against the reseller's product catalog when the product name, variant, or keyword matches:
     * "Medium", "Medium coffee", "Kopi Medium", "Med" -> map to SKU: "COFFEE-MED-250" (Sell Price: Rp 15,000, Base Cost: Rp 10,000).
     * "Premium", "Premium coffee", "Kopi Premium", "Prem" -> map to SKU: "COFFEE-PREM-250" (Sell Price: Rp 25,000, Base Cost: Rp 20,000).
     * "Medium 1kg", "Medium 1 kg" -> map to SKU: "COFFEE-MED-1KG" (Sell Price: Rp 60,000, Base Cost: Rp 40,000).
     * "Premium 1kg", "Premium 1 kg" -> map to SKU: "COFFEE-PREM-1KG" (Sell Price: Rp 100,000, Base Cost: Rp 80,000).
   - Only if a product is truly custom and unrelated to coffee or the catalog (e.g. "Matcha Latte", "Kaos Polos", "Mug Keramik"), set matchedSku: "CUSTOM", preserve the exact product name, and note in ambiguities.
   - Derive the unit price from the total payment amount if specified (e.g. 2 units for Rp 30,000 -> suggestedUnitPrice: 15000).
   - If shipping or courier is NOT mentioned, set quotedOngkir: 0 and buyerOngkir: 0. Do not invent arbitrary shipping costs when none was specified.
4. Keep buyer, payer, and recipient as three distinct identities:
   - Buyer: Person or reference code placing the order in chat.
   - Payer: Person paying the money (may be different, e.g. husband/parent/friend transfer).
   - Recipient: Delivery package receiver and physical shipping address.
5. Distinguish payment types:
   - TRANSFER: Bank transfer / e-wallet.
   - COD: Regular courier expedition COD.
   - DIRECT_COD: Direct delivery by reseller or personal courier (Note: Direct COD payment must NEVER be treated as automatically verified from chat claim alone).
6. Identify ambiguities & exceptions:
   - If an address is incomplete (e.g. "kirim ke Bandung" without street), add to ambiguities.
   - If payer name is different from buyer, flag isPayerDifferentFromBuyer: true and note in ambiguities.
7. Si Gembul persona:
   - Supportive, calm, friendly, and operationally sharp.
   - Keep answers non-technical and easy for Indonesian micro-resellers.
    - In 'explanation', summarize clearly what you detected ("Here's what I found...") and if any detail is needed ("I need one detail: ...").
8. Distinguish a new or updated transaction from a conversational follow-up:
    - For a question about prior chat context, return responseMode: "CONVERSATION", items: [], and answer from the supplied prior structured transaction context. Do not invent an empty order candidate.
    - Structured transaction context includes originalQuantity/originalUnit and normalizedPieces. Treat normalizedPieces and financials as authoritative catalog-derived values; do not re-derive or conflate them from natural-language phrasing.
    - For a change to a prior transaction, return responseMode: "TRANSACTION" with the complete replacement candidate reflecting the latest requested state.
    - For a clearly new transaction, return responseMode: "TRANSACTION" and do not merge it with an earlier order.

Authoritative Reseller Product Catalog:
${catalogSummary}

Store Context:
- Store Name: ${storeSettings.storeName || 'Si Gembul Store'}
- Origin City: ${storeSettings.storeCity || 'Bandung'}
- Default Courier: ${(storeSettings.defaultCouriers || ['J&T Express'])[0]}
`;

    // Fallback if no Gemini API Key is configured
    if (!ai) {
      console.log('No Gemini API key available, using deterministic parser fallback.');
      if (isConversationalQuestion(message || '')) {
        const contextualReply = buildFallbackConversationReply(message || '', conversationHistory, catalog);
        res.json({
          ...contextualReply,
          provider: 'fallback',
          isAIPowered: false,
          notice: 'Using bounded deterministic conversation context; Gemini reasoning is unavailable.',
        });
        return;
      }
      const parsedCandidate = fallbackDeterministicParser(message, catalog);
      const candidate = isContextualUpdate(message || '', conversationHistory)
        ? retainTransactionContext(parsedCandidate, getLatestTransactionCandidate(conversationHistory))
        : parsedCandidate;
      res.json({
        candidate,
        responseMode: 'TRANSACTION',
        explanation: candidate.explanation,
        provider: 'fallback',
        isAIPowered: false,
        notice: 'Using deterministic parser (Set GEMINI_API_KEY for full AI multi-modal reasoning)',
      });
      return;
    }

    // Build multi-turn content parts
    const contents: any[] = [];

    // Append prior conversation history turns
    if (Array.isArray(conversationHistory)) {
      for (const turn of conversationHistory.slice(-6)) {
        if (turn.role === 'user' && turn.content) {
          contents.push({
            role: 'user',
            parts: [{ text: turn.content }],
          });
        } else if (turn.role === 'assistant' && turn.content) {
          const candidateContext = Array.isArray(turn.candidate?.items) && turn.candidate.items.length > 0
            ? `\nStructured transaction context: ${JSON.stringify(buildStructuredTransactionContext(turn.candidate, catalog))}`
            : '';
          contents.push({
            role: 'model',
            parts: [{ text: `${turn.content}${candidateContext}` }],
          });
        }
      }
    }

    // Current turn content
    const currentParts: any[] = [];
    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      currentParts.push({
        inlineData: {
          mimeType: imageMimeType || 'image/jpeg',
          data: cleanBase64,
        },
      });
    }

    currentParts.push({
      text: `Respond to this latest reseller message using the bounded conversation context. Determine whether it is a new/updated transaction or a conversational follow-up.\n\n"${message || 'Uploaded payment/order evidence image'}"`,
    });

    contents.push({
      role: 'user',
      parts: currentParts,
    });

    // Call Gemini with Structured JSON Output
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseSchema: EXTRACTION_SCHEMA,
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    let candidateData: any;
    let provider = 'gemini';
    try {
      candidateData = JSON.parse(responseText);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON response:', responseText);
      candidateData = { ...fallbackDeterministicParser(message, catalog), responseMode: 'TRANSACTION' };
      provider = 'fallback';
    }

    const isConversation = candidateData.responseMode === 'CONVERSATION';
    res.json({
      candidate: isConversation ? undefined : candidateData,
      responseMode: candidateData.responseMode,
      explanation: candidateData.explanation,
      provider,
      isAIPowered: provider === 'gemini',
      rawExplanation: candidateData.explanation,
    });
  } catch (error: any) {
    console.error('Gemini interpretation error:', error);
    res.status(500).json({
      error: error.message || 'Failed to process agent interpretation',
      candidate: fallbackDeterministicParser(req.body.message || '', req.body.catalog || []),
      provider: 'fallback',
    });
  }
});

// Fallback rule-based parser for offline / test mock cases
function fallbackDeterministicParser(text: string, catalog: any[] = []) {
  const lower = text.toLowerCase();

  // All standard field label keys for section extraction
  const ALL_FIELD_LABELS = [
    'customer/reference', 'customer', 'reference', 'pelanggan', 'buyer', 'a.n', 'an', 'atas nama', 'nama', 'penerima', 'ref',
    'order', 'pesanan', 'item', 'barang', 'produk', 'product',
    'payment', 'pembayaran', 'bayar', 'transfer', 'tf', 'total',
    'address', 'alamat', 'kirim ke', 'tujuan', 'lokasi',
    'courier', 'kurir', 'ekspedisi', 'ongkir', 'shipping'
  ];

  // Helper to extract labeled sections even without newlines (e.g. "Customer/reference: X Order: Y Payment: Z")
  function extractSection(src: string, startKeywords: string[]): string | null {
    const startPattern = `(?:${startKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[:=]\\s*`;
    const nextPattern = `(?=(?:\\b(?:${ALL_FIELD_LABELS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*[:=]|$))`;
    const regex = new RegExp(`${startPattern}([\\s\\S]*?)${nextPattern}`, 'i');
    const match = src.match(regex);
    return match && match[1] ? match[1].trim() : null;
  }

  // 1. Extract Customer / Reference section
  const customerSection = extractSection(text, ['customer/reference', 'customer', 'reference', 'pelanggan', 'buyer', 'a.n', 'an', 'atas nama', 'nama', 'penerima', 'ref']);
  let detectedName = customerSection || '';
  if (!detectedName) {
    const refMatch = text.match(/(?:customer\/reference|customer|reference|pelanggan|buyer|a\.n|an|atas nama|nama|penerima|ref)[:\s]*\n*([^\n\r,]+)/i);
    if (refMatch && refMatch[1]) {
      detectedName = refMatch[1].trim();
    }
  }

  // 2. Extract Payment section & determine payment method and amount
  const paymentSection = extractSection(text, ['payment', 'pembayaran', 'bayar', 'transfer', 'tf', 'total']);
  const paymentSource = paymentSection || text;
  const paymentSourceLower = paymentSource.toLowerCase();

  let paymentMethod = 'TRANSFER';
  if (paymentSourceLower.includes('direct cod') || paymentSourceLower.includes('kurir sendiri') || paymentSourceLower.includes('antar langsung') || lower.includes('direct cod') || lower.includes('kurir sendiri')) {
    paymentMethod = 'DIRECT_COD';
  } else if (paymentSourceLower.includes('cod') || lower.includes('cod')) {
    paymentMethod = 'COD';
  } else if (paymentSourceLower.includes('qris') || lower.includes('qris')) {
    paymentMethod = 'QRIS';
  } else if (paymentSourceLower.includes('cash') || paymentSourceLower.includes('tunai') || lower.includes('cash') || lower.includes('tunai')) {
    paymentMethod = 'CASH';
  } else if (paymentSourceLower.includes('transfer') || paymentSourceLower.includes('tf') || lower.includes('transfer') || lower.includes('tf')) {
    paymentMethod = 'TRANSFER';
  }

  // Detect explicit payment amount (e.g. "Rp30,000", "Rp 30.000", "Rp30000", "30,000")
  let paymentAmount: number | undefined = undefined;
  const paymentAmountMatch = paymentSource.match(/(?:rp\.?\s*|payment[:\s]*|bayar[:\s]*|transfer[:\s]*|total[:\s]*)([\d\.,]{4,15})/i) ||
                             text.match(/(?:rp\.?\s*|payment[:\s]*|bayar[:\s]*|transfer[:\s]*|total[:\s]*)([\d\.,]{4,15})/i);
  if (paymentAmountMatch) {
    const cleanNum = paymentAmountMatch[1].replace(/[\.,](?=\d{3})/g, '').replace(/[\.,]/g, '');
    const parsed = parseInt(cleanNum, 10);
    if (!isNaN(parsed) && parsed > 0) {
      paymentAmount = parsed;
    }
  }

  // 3. Extract Order section & parse ordered items
  const labeledOrderSection = extractSection(text, ['order', 'pesanan', 'item', 'barang', 'produk', 'product']);
  const orderSection = labeledOrderSection || (/\b(medium|premium|gayo|robusta|toraja|drip|madu|mete)\b/i.test(text) ? text : null);
  const matchedItems: any[] = [];
  const ambiguities: string[] = [];

  const DEFAULT_FALLBACK_CATALOG = [
    { id: 'prod_coffee_med_250', sku: 'COFFEE-MED-250', name: 'Medium coffee (250g)', baseCost: 10000, sellPrice: 15000, bulkPrice: 13000, pieceEquivalent: 1 },
    { id: 'prod_coffee_prem_250', sku: 'COFFEE-PREM-250', name: 'Premium coffee (250g)', baseCost: 20000, sellPrice: 25000, bulkPrice: 23000, pieceEquivalent: 1 },
    { id: 'prod_coffee_med_1kg', sku: 'COFFEE-MED-1KG', name: 'Medium coffee (1kg Bulk)', baseCost: 40000, sellPrice: 60000, bulkPrice: 52000, pieceEquivalent: 4 },
    { id: 'prod_coffee_prem_1kg', sku: 'COFFEE-PREM-1KG', name: 'Premium coffee (1kg Bulk)', baseCost: 80000, sellPrice: 100000, bulkPrice: 92000, pieceEquivalent: 4 },
    { id: 'prod_gayo_250', sku: 'KOPI-GAYO-250', name: 'Kopi Arabika Gayo Aceh 250g', baseCost: 35000, sellPrice: 55000, bulkPrice: 50000, pieceEquivalent: 1 },
    { id: 'prod_robusta_200', sku: 'KOPI-ROB-200', name: 'Kopi Robusta Lampung 200g', baseCost: 20000, sellPrice: 35000, bulkPrice: 30000, pieceEquivalent: 1 },
    { id: 'prod_toraja_200', sku: 'KOPI-TOR-200', name: 'Kopi Arabika Toraja Sapan 200g', baseCost: 38000, sellPrice: 60000, bulkPrice: 55000, pieceEquivalent: 1 },
    { id: 'prod_drip_10s', sku: 'KOPI-DRIP-10S', name: 'Drip Bag Coffee (Box isi 10)', baseCost: 42000, sellPrice: 65000, bulkPrice: 60000, pieceEquivalent: 1 },
    { id: 'prod_madu_350', sku: 'MADU-HUTAN-350', name: 'Madu Hutan Sumbawa 350ml', baseCost: 45000, sellPrice: 70000, bulkPrice: 65000, pieceEquivalent: 1 },
  ];

  const activeCatalog = [...catalog];
  for (const def of DEFAULT_FALLBACK_CATALOG) {
    if (!activeCatalog.some(p => p.sku?.toLowerCase() === def.sku.toLowerCase())) {
      activeCatalog.push(def);
    }
  }

  // Helper to match a product string to activeCatalog
  const matchProductFromCatalog = (query: string) => {
    const clean = query.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return undefined;

    // 1. Exact match
    const exact = activeCatalog.find(p => p.name.toLowerCase() === clean || p.sku.toLowerCase() === clean);
    if (exact) return exact;

    // 2. Keyword normalization
    const is1kg = /(?:^|\s)\d+\s*kg\b/.test(clean) || clean.includes('1000g') || clean.includes('1000 g') || clean.includes('bulk');
    const isMed = clean.includes('medium') || clean.includes('med ');
    const isPrem = clean.includes('premium') || clean.includes('prem ') || clean.includes('specialty');

    if (isMed && is1kg) return activeCatalog.find(p => p.sku === 'COFFEE-MED-1KG');
    if (isMed) return activeCatalog.find(p => p.sku === 'COFFEE-MED-250');
    if (isPrem && is1kg) return activeCatalog.find(p => p.sku === 'COFFEE-PREM-1KG');
    if (isPrem) return activeCatalog.find(p => p.sku === 'COFFEE-PREM-250');
    if (clean.includes('gayo')) return activeCatalog.find(p => p.sku === 'KOPI-GAYO-250');
    if (clean.includes('robusta') || clean.includes('lampung')) return activeCatalog.find(p => p.sku === 'KOPI-ROB-200');
    if (clean.includes('drip')) return activeCatalog.find(p => p.sku === 'KOPI-DRIP-10S');
    if (clean.includes('madu')) return activeCatalog.find(p => p.sku === 'MADU-HUTAN-350');

    // 3. Substring match
    return activeCatalog.find(p => p.name.toLowerCase().includes(clean) || clean.includes(p.name.toLowerCase()));
  };

  if (orderSection) {
    // Break order section by newlines or commas
    const itemChunks = orderSection.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    for (const chunk of itemChunks) {
      const parseChunk = chunk.replace(/[.!?]+$/, '').trim();
      const itemMatch1 = parseChunk.match(/^(\d+)\s*(?:x|pcs|bks|bungkus|pack|box|cup|botol|can)?\s*(.+?)(?:\s*(?:@|harga|sebesar|rp)?\s*(?:rp\.?\s*)?([\d\.,]+))?$/i);
      const itemMatch2 = parseChunk.match(/^(.+?)\s*(\d+)\s*(kg|pcs|bks|bungkus|pack|box|cup|botol|can)?$/i);

      let qty = 1;
      let prodName = parseChunk;
      let explicitPrice: number | undefined = undefined;

      if (itemMatch1) {
        qty = parseInt(itemMatch1[1], 10) || 1;
        prodName = itemMatch1[2].trim();
        explicitPrice = itemMatch1[3] ? parseInt(itemMatch1[3].replace(/[\.,]/g, ''), 10) : undefined;
      } else if (itemMatch2) {
        qty = parseInt(itemMatch2[2], 10) || 1;
        const unit = itemMatch2[3]?.toLowerCase();
        prodName = unit === 'kg' ? `${itemMatch2[1].trim()} 1kg` : itemMatch2[1].trim();
      }

      // Check if matches catalog
      const catMatch = matchProductFromCatalog(prodName);

      if (catMatch) {
        matchedItems.push({
          matchedSku: catMatch.sku,
          rawText: chunk,
          productName: catMatch.name,
          quantity: qty,
          suggestedUnitPrice: explicitPrice !== undefined ? explicitPrice : catMatch.sellPrice,
          suggestedUnitCost: catMatch.baseCost,
        });
      } else {
        // Preserve user's explicit custom product name
        matchedItems.push({
          matchedSku: 'CUSTOM',
          rawText: chunk,
          productName: prodName,
          quantity: qty,
          suggestedUnitPrice: explicitPrice,
          suggestedUnitCost: 0,
        });
        ambiguities.push(`Product "${prodName}" is a custom item (not in catalog).`);
      }
    }
  }

  // If no order section matched or items empty, check catalog against raw text
  if (matchedItems.length === 0) {
    for (const product of activeCatalog) {
      const prodNameLower = product.name.toLowerCase();
      const skuLower = product.sku.toLowerCase();
      
      if (lower.includes(skuLower) || lower.includes(prodNameLower) || 
         (prodNameLower.includes('medium') && lower.includes('medium')) ||
         (prodNameLower.includes('premium') && lower.includes('premium')) ||
         (prodNameLower.includes('gayo') && lower.includes('gayo')) ||
         (prodNameLower.includes('robusta') && lower.includes('robusta')) ||
         (prodNameLower.includes('toraja') && lower.includes('toraja')) ||
         (prodNameLower.includes('drip') && lower.includes('drip')) ||
         (prodNameLower.includes('madu') && lower.includes('madu')) ||
         (prodNameLower.includes('mete') && (lower.includes('mete') || lower.includes('mede')))) {
        
        const qtyMatch = text.match(new RegExp(`(\\d+)\\s*(?:bungkus|bks|pcs|pack|box|botol|pouch|x)?\\s*(?:${product.name.split(' ')[0]}|medium|premium|kopi|madu|kacang)?`, 'i'));
        const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

        matchedItems.push({
          matchedSku: product.sku,
          rawText: product.name,
          productName: product.name,
          quantity: isNaN(qty) || qty <= 0 ? 1 : qty,
          suggestedUnitPrice: product.sellPrice,
          suggestedUnitCost: product.baseCost,
        });
      }
    }
  }

  // If still empty, check for freeform quantity + text pattern anywhere in text
  if (matchedItems.length === 0) {
    const genericItemMatch = text.match(/(\d+)\s*(?:x|pcs|bks|bungkus|pack|box|cup|botol)?\s*([a-zA-Z\s\-_]{3,30})/i);
    if (genericItemMatch && genericItemMatch[2].trim().toLowerCase() !== 'customer' && genericItemMatch[2].trim().toLowerCase() !== 'payment') {
      const qty = parseInt(genericItemMatch[1], 10) || 1;
      const prodName = genericItemMatch[2].trim();
      matchedItems.push({
        matchedSku: 'CUSTOM',
        rawText: genericItemMatch[0],
        productName: prodName,
        quantity: qty,
        suggestedUnitPrice: paymentAmount ? Math.round(paymentAmount / qty) : undefined,
        suggestedUnitCost: 0,
      });
      ambiguities.push(`Product "${prodName}" is a custom item (not in catalog).`);
    } else {
      // Clean fallback preserving custom product placeholder without catalog hijacking
      matchedItems.push({
        matchedSku: 'CUSTOM',
        rawText: 'Item',
        productName: 'Custom Item',
        quantity: 1,
        suggestedUnitPrice: paymentAmount || 0,
        suggestedUnitCost: 0,
      });
      ambiguities.push('Product specification needs confirmation.');
    }
  }

  // If we have a total payment amount and items have no suggestedUnitPrice, allocate it accurately
  if (paymentAmount !== undefined && paymentAmount > 0) {
    const totalQty = matchedItems.reduce((sum, it) => sum + (it.quantity || 1), 0);
    if (totalQty > 0) {
      for (const item of matchedItems) {
        if (!item.suggestedUnitPrice || item.suggestedUnitPrice === 0) {
          item.suggestedUnitPrice = Math.round(paymentAmount / totalQty);
        }
      }
    }
  }

  // 4. Detect phone number
  const phoneMatch = text.match(/(?:08|\+628)[0-9\s-]{8,14}/);
  const detectedPhone = phoneMatch ? phoneMatch[0].replace(/[\s-]/g, '') : '';

  if (!detectedName) {
    detectedName = 'Pelanggan Reseller';
  }

  // 5. Detect shipping / courier / address section
  const addressSection = extractSection(text, ['address', 'alamat', 'kirim ke', 'tujuan', 'lokasi']);
  let detectedAddress = addressSection || '';
  if (!detectedAddress) {
    const addressMatch = text.match(/(?:kirim ke|alamat|tujuan|address)[:\s]+([^,\.\n]+(?:,\s*[^,\.\n]+)*)/i);
    if (addressMatch) {
      detectedAddress = addressMatch[1].trim();
    }
  }

  let courierName = '';
  let quotedOngkir = 0;
  let buyerOngkir = 0;

  if (lower.includes('j&t') || lower.includes('jnt')) {
    courierName = 'J&T Express';
    quotedOngkir = 12000;
    buyerOngkir = 12000;
  } else if (lower.includes('jne')) {
    courierName = 'JNE Reguler';
    quotedOngkir = 12000;
    buyerOngkir = 12000;
  } else if (lower.includes('sicepat')) {
    courierName = 'SiCepat';
    quotedOngkir = 12000;
    buyerOngkir = 12000;
  } else if (lower.includes('gosend') || lower.includes('grab')) {
    courierName = 'GoSend Instant';
    quotedOngkir = 20000;
    buyerOngkir = 20000;
  } else if (paymentMethod === 'DIRECT_COD') {
    courierName = 'Direct COD (Kurir Sendiri)';
    quotedOngkir = 0;
    buyerOngkir = 0;
  }

  if (detectedAddress && detectedAddress.length < 5) {
    ambiguities.push('Recipient shipping address is incomplete.');
  }
  if (paymentMethod === 'DIRECT_COD') {
    ambiguities.push('Direct COD delivery selected: Payment requires physical verification upon handover.');
  }

  return {
    buyerName: detectedName,
    buyerPhone: detectedPhone,
    payerName: detectedName,
    recipientName: detectedName,
    recipientPhone: detectedPhone,
    recipientAddress: detectedAddress,
    recipientCity: 'Bandung',
    isPayerDifferentFromBuyer: false,
    isRecipientDifferentFromBuyer: false,
    items: matchedItems,
    paymentMethod,
    claimedPaymentAmount: paymentAmount,
    paymentProofClaimed: lower.includes('transfer') || lower.includes('tf') || lower.includes('sudah bayar'),
    courierName: courierName || 'Direct / Pickup',
    quotedOngkir,
    buyerOngkir,
    sellerAbsorbedOngkir: 0,
    confidence: 0.95,
    ambiguities,
    explanation: `Here's what I found from your message:\n- Buyer / Reference: ${detectedName}\n- ${matchedItems.map(i => `${i.quantity}x ${i.productName} (@ Rp ${(i.suggestedUnitPrice || 0).toLocaleString('id-ID')})`).join(', ')}\n- Payment: ${paymentMethod}${paymentAmount ? ` (Rp ${paymentAmount.toLocaleString('id-ID')})` : ''}${ambiguities.length > 0 ? `\n\nI need one detail:\n- ${ambiguities.join('\n- ')}` : ''}`,
  };
}

// Start Server and mount Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Si Gembul Reseller Guard server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
