declare module "g-i-s" {
  type ImageSearchResult = {
    url?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };

  type ImageSearchOptions = {
    searchTerm: string;
    queryStringAddition?: string;
    [key: string]: unknown;
  };

  type ImageSearchCallback = (error: unknown, results: ImageSearchResult[]) => void;

  export default function gis(
    options: string | ImageSearchOptions,
    callback: ImageSearchCallback,
  ): void;
}
