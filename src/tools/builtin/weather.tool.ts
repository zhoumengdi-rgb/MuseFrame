import type { ToolDefinition } from '../tools.types.js';

const WEATHER_BASE_URL = 'https://wttr.in';

interface WttrText {
  value?: string;
}

interface WttrResponse {
  current_condition?: Array<{
    temp_C?: string;
    FeelsLikeC?: string;
    humidity?: string;
    weatherDesc?: WttrText[];
    windspeedKmph?: string;
    winddir16Point?: string;
    observation_time?: string;
  }>;
  nearest_area?: Array<{
    areaName?: WttrText[];
    region?: WttrText[];
    country?: WttrText[];
  }>;
}

export const weatherTool: ToolDefinition = {
  name: 'get_weather',
  description: '查询指定城市的当前天气，包括温度、体感温度、湿度、天气状况、风向风速和观测时间。',
  parameters: {
    city: {
      type: 'string',
      description: '城市名，中英文均可，例如 北京、Shanghai',
      required: true,
    },
  },
  async execute(args, ctx) {
    const city = typeof args.city === 'string' ? args.city.trim() : '';
    if (!city) throw new Error('缺少城市名');

    const url = `${WEATHER_BASE_URL}/${encodeURIComponent(city)}?format=j1&lang=zh`;
    const response = await fetch(url, {
      signal: ctx.signal,
      headers: { 'User-Agent': 'low-code-test/1.0' },
    });
    if (!response.ok) {
      throw new Error(`天气服务返回 HTTP ${response.status}`);
    }

    const data = (await response.json()) as WttrResponse;
    const current = data.current_condition?.[0];
    if (!current) throw new Error(`未查询到「${city}」的天气数据`);

    const area = data.nearest_area?.[0];
    return JSON.stringify(
      {
        city: area?.areaName?.[0]?.value ?? city,
        region: area?.region?.[0]?.value,
        country: area?.country?.[0]?.value,
        condition: current.weatherDesc?.[0]?.value,
        temperatureC: current.temp_C,
        feelsLikeC: current.FeelsLikeC,
        humidityPercent: current.humidity,
        windKmph: current.windspeedKmph,
        windDirection: current.winddir16Point,
        observedAtLocal: current.observation_time,
      },
      null,
      2,
    );
  },
};
