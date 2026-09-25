using System;

class Program {
    static void Main() {
        string documentType = "Quotation";
        var norm = documentType.Trim().ToLowerInvariant();
        string prefix = "INV-";
        if (norm.Contains("credit")) prefix = "CN-";
        else if (norm.Contains("estimate") || norm.Contains("quote")) prefix = "EST-";
        else if (norm.Contains("recurring")) prefix = "REC-";
        else if (norm.Contains("challan")) prefix = "DC-";
        
        Console.WriteLine("Prefix: " + prefix);
    }
}
