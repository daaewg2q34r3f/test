const axios = require('axios');

async function testVolcanoAPI() {
  const apiKey = '156f4b05-a23c-41d4-8a92-02586e793073';
  const model = 'seed-v2'; // 默认模型

  const body = {
    model: model,
    prompt: '2D cat',
    size: '2K',
    response_format: 'url',
    sequential_image_generation: 'disabled',
    stream: false,
    watermark: false
  };

  console.log('正在测试火山引擎API...');
  console.log('API Key:', apiKey);
  console.log('请求体:', JSON.stringify(body, null, 2));
  console.log('---');

  try {
    const res = await axios.post(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      body,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ 成功！');
    console.log('响应状态:', res.status);
    console.log('响应数据:', JSON.stringify(res.data, null, 2));
  } catch (error) {
    console.log('❌ 失败！');
    console.log('错误类型:', error.name);
    console.log('错误消息:', error.message);

    if (error.response) {
      console.log('---');
      console.log('响应状态码:', error.response.status);
      console.log('响应头:', JSON.stringify(error.response.headers, null, 2));
      console.log('响应数据:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.log('---');
      console.log('请求已发送，但没有收到响应');
      console.log('可能原因: 网络问题、超时、或API端点不可达');
    } else {
      console.log('---');
      console.log('请求配置错误:', error.message);
    }
  }
}

testVolcanoAPI();
