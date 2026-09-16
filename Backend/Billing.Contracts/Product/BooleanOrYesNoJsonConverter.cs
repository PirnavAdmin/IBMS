using System.Text.Json;
using System.Text.Json.Serialization;

namespace Billing.Contracts;

/// <summary>
/// JSON converter that accepts boolean values (true/false) as well as Yes/No strings.
/// </summary>
public class BooleanOrYesNoJsonConverter : JsonConverter<bool>
{
    public override bool Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.True)
        {
            return true;
        }

        if (reader.TokenType == JsonTokenType.False)
        {
            return false;
        }

        if (reader.TokenType == JsonTokenType.Number)
        {
            return reader.GetInt32() != 0;
        }

        if (reader.TokenType == JsonTokenType.String)
        {
            var str = reader.GetString()?.Trim();
            if (string.Equals(str, "yes", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(str, "y", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(str, "true", StringComparison.OrdinalIgnoreCase) ||
                str == "1")
            {
                return true;
            }

            if (string.Equals(str, "no", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(str, "n", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(str, "false", StringComparison.OrdinalIgnoreCase) ||
                str == "0")
            {
                return false;
            }
        }

        return false;
    }

    public override void Write(Utf8JsonWriter writer, bool value, JsonSerializerOptions options)
    {
        writer.WriteBooleanValue(value);
    }
}
