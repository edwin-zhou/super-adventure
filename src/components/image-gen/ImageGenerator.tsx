import { useState } from 'react';
import { Wand2, Download, Loader2, X, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  generateImage,
  generateImageStreaming,
  imageDataToUrl,
  downloadImage,
  type ImageGenerationOptions,
} from '@/lib/openai-image';

interface ImageGeneratorProps {
  onImageGenerated?: (imageUrl: string) => void;
  onClose?: () => void;
}

export function ImageGenerator({ onImageGenerated, onClose }: ImageGeneratorProps) {
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useStreaming, setUseStreaming] = useState(false);

  // Advanced options
  const [model, setModel] = useState<'gpt-image-1.5' | 'gpt-image-1' | 'gpt-image-1-mini'>(
    'gpt-image-1.5'
  );
  const [quality, setQuality] = useState<'low' | 'medium' | 'high' | 'auto'>('medium');
  const [size, setSize] = useState<'1024x1024' | '1024x1536' | '1536x1024' | 'auto'>('1024x1024');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    setLoading(true);
    setError(null);
    setImageUrl(null);

    const options: ImageGenerationOptions = {
      model,
      quality,
      size,
      outputFormat: 'png',
    };

    try {
      if (useStreaming) {
        await generateImageStreaming(
          prompt,
          {
            onPartialImage: (imageData, index) => {
              // Show partial images for progressive loading effect
              const url = imageDataToUrl(imageData, 'png');
              setImageUrl(url);
              console.log(`Partial image ${index} received`);
            },
            onComplete: (result) => {
              const url = imageDataToUrl(result.imageData, result.format);
              setImageUrl(url);
              if (onImageGenerated) {
                onImageGenerated(url);
              }
            },
            onError: (err) => {
              setError(err.message);
              setLoading(false);
            },
          },
          options
        );
      } else {
        const result = await generateImage(prompt, options);
        const url = imageDataToUrl(result.imageData, result.format);
        setImageUrl(url);
        
        if (onImageGenerated) {
          onImageGenerated(url);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate image');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (imageUrl) {
      // Extract base64 data from data URL
      const base64Data = imageUrl.split(',')[1];
      downloadImage(base64Data, 'generated-image', 'png');
    }
  };

  const handleClear = () => {
    setImageUrl(null);
    setError(null);
    setPrompt('');
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5" />
          <h2 className="text-lg font-semibold">AI Image Generator</h2>
        </div>
        {onClose && (
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Prompt Input */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Image Description</Label>
          <Input
            id="prompt"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            disabled={loading}
            className="w-full"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Press Enter to generate
          </p>
        </div>

        {/* Advanced Options */}
        <div className="space-y-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {showAdvanced ? 'Hide' : 'Show'} Advanced Options
          </button>

          {showAdvanced && (
            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              {/* Model Selection */}
              <div className="space-y-1">
                <Label htmlFor="model" className="text-xs">Model</Label>
                <select
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value as any)}
                  disabled={loading}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="gpt-image-1.5">GPT-Image-1.5 (Best)</option>
                  <option value="gpt-image-1">GPT-Image-1 (Balanced)</option>
                  <option value="gpt-image-1-mini">GPT-Image-1-Mini (Fast)</option>
                </select>
              </div>

              {/* Quality */}
              <div className="space-y-1">
                <Label htmlFor="quality" className="text-xs">Quality</Label>
                <select
                  id="quality"
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as any)}
                  disabled={loading}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="auto">Auto</option>
                  <option value="low">Low (Fast)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High (Slow)</option>
                </select>
              </div>

              {/* Size */}
              <div className="space-y-1">
                <Label htmlFor="size" className="text-xs">Size</Label>
                <select
                  id="size"
                  value={size}
                  onChange={(e) => setSize(e.target.value as any)}
                  disabled={loading}
                  className="w-full px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                >
                  <option value="auto">Auto</option>
                  <option value="1024x1024">Square (1024×1024)</option>
                  <option value="1024x1536">Portrait (1024×1536)</option>
                  <option value="1536x1024">Landscape (1536×1024)</option>
                </select>
              </div>

              {/* Streaming Toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="streaming"
                  checked={useStreaming}
                  onChange={(e) => setUseStreaming(e.target.checked)}
                  disabled={loading}
                  className="rounded"
                />
                <Label htmlFor="streaming" className="text-xs cursor-pointer">
                  Enable progressive streaming
                </Label>
              </div>
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* Image Preview */}
        {imageUrl && (
          <div className="space-y-2">
            <div className="relative rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img
                src={imageUrl}
                alt="Generated"
                className="w-full h-auto"
                style={{ opacity: loading ? 0.6 : 1 }}
              />
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
              )}
            </div>

            {/* Image Actions */}
            {!loading && (
              <div className="flex gap-2">
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </Button>
                <Button
                  onClick={handleClear}
                  variant="outline"
                  size="sm"
                  className="flex-1"
                >
                  <X className="w-4 h-4 mr-2" />
                  Clear
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Prompt Suggestions */}
        {!imageUrl && !loading && (
          <div className="space-y-2">
            <Label className="text-xs text-gray-500">Quick Examples:</Label>
            <div className="grid gap-2">
              {[
                'A cute baby sea otter floating on its back',
                'Futuristic cityscape at night with neon lights',
                'Abstract geometric pattern in blue and gold',
                'Professional headshot with soft studio lighting',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => setPrompt(suggestion)}
                  className="text-left text-xs p-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800">
        <Button
          onClick={handleGenerate}
          disabled={loading || !prompt.trim()}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="w-4 h-4 mr-2" />
              Generate Image
            </>
          )}
        </Button>

        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-2">
          Powered by OpenAI GPT-Image-1.5
        </p>
      </div>
    </div>
  );
}
