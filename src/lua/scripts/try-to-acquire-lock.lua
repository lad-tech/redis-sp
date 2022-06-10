local resource_key = KEYS[1]

local owner_id = ARGV[1]
local max_lock_time_millis = ARGV[2]

-- Sets the expiration key if it doesn't exist
return redis.call('SET', resource_key, owner_id, 'NX', 'PX', max_lock_time_millis)
