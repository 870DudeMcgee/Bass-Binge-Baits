'use strict';

const crypto = require('node:crypto');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TO_EMAIL = 'Bassbingebaits@gmail.com';
const MAX_LENGTHS = {
  name: 80,
  email: 120,
  phone: 40,
  topic: 80,
  message: 2000,
  company: 120
};

function sendJson(response, statusCode, payload) {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(statusCode).json(payload);
}

function cleanText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getSubmission(rawBody) {
  const body = rawBody && typeof rawBody === 'object' ? rawBody : {};
  return {
    name: cleanText(body.name, MAX_LENGTHS.name),
    email: cleanText(body.email, MAX_LENGTHS.email),
    phone: cleanText(body.phone, MAX_LENGTHS.phone),
    topic: cleanText(body.topic, MAX_LENGTHS.topic),
    message: cleanText(body.message, MAX_LENGTHS.message),
    company: cleanText(body.company, MAX_LENGTHS.company)
  };
}

function validateSubmission(submission) {
  if (submission.company) {
    return null;
  }

  if (!submission.name) {
    return 'Please enter your name.';
  }

  if (!isValidEmail(submission.email)) {
    return 'Please enter a valid email address.';
  }

  if (!submission.topic) {
    return 'Please choose a topic.';
  }

  if (submission.message.length < 10) {
    return 'Please enter a message with at least 10 characters.';
  }

  return null;
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;

  if (!origin || !host) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch (error) {
    return false;
  }
}

function buildEmailPayload(submission) {
  const toEmail = process.env.CONTACT_TO_EMAIL || DEFAULT_TO_EMAIL;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;
  const subject = `Bass Binge contact: ${submission.topic}`;
  const text = [
    'New Bass Binge website contact form message',
    '',
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Phone: ${submission.phone || 'Not provided'}`,
    `Topic: ${submission.topic}`,
    '',
    submission.message
  ].join('\n');

  return {
    from: fromEmail,
    to: [toEmail],
    reply_to: submission.email,
    subject,
    text,
    tags: [
      {
        name: 'source',
        value: 'contact_form'
      }
    ]
  };
}

async function sendContactEmail(submission) {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.CONTACT_FROM_EMAIL;

  if (!apiKey || !fromEmail) {
    return {
      ok: false,
      status: 503,
      code: 'email_not_configured'
    };
  }

  const resendResponse = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': crypto.randomUUID(),
      'User-Agent': 'bass-binge-website/1.0'
    },
    body: JSON.stringify(buildEmailPayload(submission))
  });

  let result = null;
  try {
    result = await resendResponse.json();
  } catch (error) {
    result = null;
  }

  if (!resendResponse.ok) {
    console.error('Resend contact email failed', {
      status: resendResponse.status,
      response: result
    });

    return {
      ok: false,
      status: 502,
      code: 'email_delivery_failed'
    };
  }

  return {
    ok: true,
    id: result && result.id ? result.id : null
  };
}

module.exports = async function handler(request, response) {
  if (request.method === 'OPTIONS') {
    response.setHeader('Allow', 'POST, OPTIONS');
    return response.status(204).send('');
  }

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST, OPTIONS');
    return sendJson(response, 405, {
      ok: false,
      message: 'Method not allowed.'
    });
  }

  if (!isSameOrigin(request)) {
    return sendJson(response, 403, {
      ok: false,
      message: 'Request origin is not allowed.'
    });
  }

  let submission;
  try {
    submission = getSubmission(request.body);
  } catch (error) {
    return sendJson(response, 400, {
      ok: false,
      message: 'Invalid form submission.'
    });
  }

  if (submission.company) {
    return sendJson(response, 200, {
      ok: true,
      message: 'Message sent.'
    });
  }

  const validationMessage = validateSubmission(submission);
  if (validationMessage) {
    return sendJson(response, 400, {
      ok: false,
      message: validationMessage
    });
  }

  const emailResult = await sendContactEmail(submission);
  if (!emailResult.ok) {
    const statusCode = emailResult.status || 502;
    const message =
      emailResult.code === 'email_not_configured'
        ? 'Email delivery is not configured yet.'
        : 'Email delivery failed.';

    return sendJson(response, statusCode, {
      ok: false,
      code: emailResult.code,
      message
    });
  }

  return sendJson(response, 200, {
    ok: true,
    message: 'Message sent.',
    id: emailResult.id
  });
};

