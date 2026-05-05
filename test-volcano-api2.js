const axios = require('axios');

async function testVolcanoAPIWithEndpoint() {
  // 用户提供的可能是endpoint ID
  const endpointId = '156f4b05-a23c-41d4-8a92-02586e793073';

  console.log('测试1: 将endpoint ID作为model参数');
  console.log('Endpoint ID:', endpointId);
  console.log('---');

  try {
    const body = {
      model: endpointId, // 使用endpoint ID作为model
      prompt: '2D cat',
      size: '2K',
      response_format: 'url',
      sequential_image_generation: 'disabled',
      stream: false,
      watermark: false
    };

    const res = await axios.post(
      'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      body,
      {
        headers: {
          'Authorization': `Bearer ${endpointId}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ 成功！');
    console.log('响应数据:', JSON.stringify(res.data, null, 2));
  } catch (error) {
    console.log('❌ 失败！');
    console.log('错误:', error.message);

    if (error.response) {
      console.log('状态码:', error.response.status);
      console.log('错误详情:', JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log('\n========================================\n');

  // 测试常见的模型名称
  const modelNames = [
    'doubao-seed-1-8',
    'doubao-seed-1-6',
    'seed-1-8',
    'seed-1-6',
    'seedream-4.5',
    'seedream-4.0'
  ];

  console.log('测试2: 尝试常见模型名称（需要真实的API Key）');
  console.log('注意: 这些测试可能失败，因为没有提供真实的API Key\n');

  for (const modelName of modelNames) {
    console.log(`尝试模型: ${modelName}`);
    try {
      const body = {
        model: modelName,
        prompt: '2D cat',
        size: '2K',
        response_format: 'url',
        stream: false
      };

      const res = await axios.post(
        'https://ark.cn-beijing.volces.com/api/v3/images/generations',
        body,
        {
          headers: {
            'Authorization': `Bearer ${endpointId}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      console.log(`  ✅ 成功！模型 ${modelName} 可用`);
      break;
    } catch (error) {
      if (error.response) {
        const errCode = error.response.data?.error?.code;
        console.log(`  ❌ ${errCode || error.response.status}`);
      } else {
        console.log(`  ❌ ${error.message}`);
      }
    }
  }
}

testVolcanoAPIWithEndpoint();
