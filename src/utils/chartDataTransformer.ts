/**
 * Utility function to transform API widget data into ECharts format.
 */
export const transformWidgetData = (responseData: any, chartType: string = 'line') => {
    const data = responseData.data || responseData;
    const xAxis = data.xAxis || {};
    const yAxes = data.yAxes || {};

    let xAxisData: any[] = [];
    let xAxisKey = 'x';

    if (Array.isArray(xAxis)) {
        xAxisData = xAxis;
    } else {
        xAxisKey = Object.keys(xAxis)[0] || 'x';
        xAxisData = xAxis[xAxisKey] || [];
    }

    const series = Object.keys(yAxes || {}).map((name, index) => ({
        name: name.replace('VAR_', '').replace(/_/g, ' '),
        data: yAxes[name],
        type: chartType,
        color: ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'][index % 5]
    }));

    return {
        meta: { type: chartType, ...responseData.meta },
        xAxisData,
        xAxisName: xAxisKey,
        series,
        legends: series.map(s => ({ name: s.name, color: s.color }))
    };
};
