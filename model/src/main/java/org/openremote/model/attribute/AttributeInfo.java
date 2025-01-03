package org.openremote.model.attribute;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.annotation.Nonnull;
import org.openremote.model.asset.AssetInfo;
import org.openremote.model.value.MetaHolder;
import org.openremote.model.value.NameValueHolder;

import java.util.Optional;

public interface AttributeInfo extends AssetInfo, NameValueHolder<Object>, MetaHolder, Comparable<AttributeInfo> {
    @JsonProperty
    long getTimestamp();

    @JsonProperty
    AttributeRef getRef();

    String getId();

    String getName();

    @JsonProperty
    Optional<Object> getValue();

    AttributeState getState();

    @JsonProperty
    Optional<Object> getOldValue();

    <U> Optional<U> getOldValue(@Nonnull Class<U> valueType);

    @JsonProperty
    long getOldValueTimestamp();
}
