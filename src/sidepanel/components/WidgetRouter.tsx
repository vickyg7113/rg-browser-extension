import React from 'react';
import ReactECharts from 'echarts-for-react';

interface WidgetRouterProps {
    widgetConfig: any;
    chartData?: any;
    cardHeight?: number;
}

export const WidgetRouter: React.FC<WidgetRouterProps> = ({
    widgetConfig,
    cardHeight = 300
}) => {
    const chartType = widgetConfig?.chartType || widgetConfig?.meta?.type || 'line';

    // Simple ECharts implementation based on normalized data from chartDataTransformer
    const getOption = () => {
        // widgetConfig now contains normalized data from transformWidgetData
        const { xAxisData, series, meta } = widgetConfig;

        if (!series || !Array.isArray(series)) return {};

        const baseOption: any = {
            title: {
                text: meta?.title || '',
                textStyle: { fontSize: 12, fontWeight: 'bold' }
            },
            tooltip: { trigger: 'axis' },
            legend: { bottom: 0, textStyle: { fontSize: 10 } },
            grid: { top: 40, bottom: 60, left: 50, right: 20, containLabel: true },
            xAxis: {
                type: 'category',
                data: xAxisData || [],
                axisLabel: { fontSize: 10 }
            },
            yAxis: {
                type: 'value',
                axisLabel: { fontSize: 10 }
            },
            series: series.map((s: any) => ({
                ...s,
                type: chartType === 'pie' ? 'pie' : (chartType === 'bar' ? 'bar' : 'line'),
                smooth: true
            }))
        };

        if (chartType === 'pie') {
            baseOption.xAxis = undefined;
            baseOption.yAxis = undefined;
            baseOption.tooltip.trigger = 'item';
            baseOption.series = [{
                name: meta?.title || '',
                type: 'pie',
                radius: '50%',
                data: (xAxisData || []).map((label: string, i: number) => ({
                    name: label,
                    value: (series[0]?.data?.[i]) || 0
                })),
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }];
        }

        if (chartType === 'gauge') {
            baseOption.xAxis = undefined;
            baseOption.yAxis = undefined;
            baseOption.series = [{
                type: 'gauge',
                progress: { show: true },
                detail: { valueAnimation: true, formatter: '{value}%', fontSize: 14 },
                data: [{ value: series[0]?.data?.[0] || 0, name: meta?.title || '' }]
            }];
        }

        return baseOption;
    };

    return (
        <div className="w-full bg-white rounded-lg p-2" style={{ height: cardHeight }}>
            <ReactECharts
                option={getOption()}
                style={{ height: '100%', width: '100%' }}
                opts={{ renderer: 'svg' }}
            />
        </div>
    );
};
