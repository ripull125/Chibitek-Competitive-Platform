import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

// Import your copied JSON file
// Data will be passed in as a prop from App.jsx

// Clean + split keywords into an array
// If keywords is already an array, just lowercase and trim each
function extractKeywords(arr) {
  if (!arr) return [];
  if (Array.isArray(arr)) {
    return arr.map(s => s.toLowerCase().trim()).filter(s => s.length > 0);
  }
  // fallback for string input
  return String(arr)
    .toLowerCase()
    .split(/[,-]/g)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export default function KeywordFrequencyChart({ data }) {
  const frequencyData = useMemo(() => {
    const freq = {};
    if (!Array.isArray(data)) return [];
    data.forEach((item) => {
      const words = extractKeywords(item.keywords);
      words.forEach((word) => {
        freq[word] = (freq[word] || 0) + 1;
      });
    });
    // Convert to array & sort descending
    return Object.entries(freq)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={400}>
      <BarChart data={frequencyData} margin={{ top: 20, right: 20, bottom: 60, left: 20 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="keyword"
          angle={-45}
          textAnchor="end"
          interval={0}
          height={80}
        />
        <YAxis />
        <Tooltip />
        <Bar dataKey="count" fill="#8884d8" />
      </BarChart>
    </ResponsiveContainer>
  );
}
